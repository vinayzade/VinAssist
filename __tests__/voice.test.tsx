import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { sessionStarted } from '@/features/auth';
import { setVoiceRepliesEnabled } from '@/features/settings/store/settingsSlice';
import { VoiceScreen } from '@/features/voice';
import {
  ComposedVoiceService,
  setVoiceService,
  type SpeechResult,
  type VoiceService,
} from '@/services/voice';
import { SpeechError, type SpeechService, type TextToSpeechService } from '@/services/speech';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

/* ------------------------------ fetch mock ------------------------------ */

const calls: Request[] = [];
let responder: (req: Request) => Response;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ANSWER = {
  conversationId: 'c1',
  messageId: 'm2',
  answer: 'The total due is 1,250.00 [1].',
  sources: [],
  grounded: true,
  scope: 'material',
  suggestions: [],
  context: [{ type: 'ocr', title: 'Recognised text', indexed: null }],
  modelName: 'llama',
  provider: 'huggingface',
  retrievalMs: 1,
  generationMs: 2,
  processingMs: 3,
  createdAt: '2026-09-12T00:00:00Z',
};

beforeAll(() => {
  registerAppListeners();
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    return responder(req);
  }) as typeof fetch;
});
beforeEach(() => {
  calls.length = 0;
  responder = () => json(ANSWER);
});
afterEach(() => setVoiceService(null));

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

/* ------------------------------ fake voice ------------------------------ */

interface FakeVoice extends VoiceService {
  /** Finish the current listen() with this transcript. */
  hear: (transcript: string) => void;
  /** Finish the current speak(). */
  finishSpeaking: () => void;
  spoken: string[];
  listens: number;
}

function fakeVoice({ canSpeak = true, canListen = true } = {}): FakeVoice {
  let resolveListen: ((r: SpeechResult) => void) | null = null;
  let rejectListen: ((e: Error) => void) | null = null;
  let resolveSpeak: (() => void) | null = null;
  let partial: ((t: string) => void) | undefined;
  const fake: FakeVoice = {
    spoken: [],
    listens: 0,
    canListen: () => canListen,
    canSpeak: () => canSpeak,
    listen: jest.fn((_o, listeners) => {
      fake.listens += 1;
      partial = listeners?.onPartial;
      return new Promise<SpeechResult>((resolve, reject) => {
        resolveListen = resolve;
        rejectListen = reject;
      });
    }),
    stopListening: jest.fn(() => partial?.('what is the total')),
    cancelListening: jest.fn(() => rejectListen?.(new SpeechError('cancelled', 'cancelled'))),
    speak: jest.fn((text: string) => {
      fake.spoken.push(text);
      return new Promise<void>(resolve => {
        resolveSpeak = resolve;
      });
    }),
    stopSpeaking: jest.fn(() => resolveSpeak?.()),
    isSpeaking: () => false,
    stopAll: jest.fn(),
    hear: transcript =>
      resolveListen?.({ transcript, alternatives: [transcript], confidence: 0.9, durationMs: 800 }),
    finishSpeaking: () => resolveSpeak?.(),
  };
  return fake;
}

function render(options?: { voiceReplies?: boolean }) {
  const store = setupStore();
  store.dispatch(sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }));
  if (options?.voiceReplies === false) {
    store.dispatch(setVoiceRepliesEnabled(false));
  }
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>
          <VoiceScreen
            navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
            route={{ key: 'k', name: 'Voice' } as never}
          />
        </ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return { tree, store };
}
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length > 0;
const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
  const c = host(tree, id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};
const press = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  act(async () => host(tree, id).props.onClick());
const flush = () => act(() => new Promise<void>(r => setTimeout(r, 0)));
async function waitFor(pred: () => boolean, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timeout');
    }
    await act(() => new Promise<void>(r => setTimeout(r, 20)));
  }
}

describe('VoiceScreen', () => {
  it('runs microphone -> text -> assistant -> spoken answer', async () => {
    const voice = fakeVoice();
    setVoiceService(voice);
    const { tree } = render();
    expect(has(tree, 'voice-empty')).toBe(true);
    expect(textOf(tree, 'voice-phase')).toBe('Tap to speak');

    // 1. Listening, with a live partial transcript.
    await press(tree, 'voice-mic');
    await waitFor(() => textOf(tree, 'voice-phase').startsWith('Listening'));
    expect(voice.listen).toHaveBeenCalledTimes(1);
    await press(tree, 'voice-mic'); // stop -> partial arrives
    await flush();
    expect(textOf(tree, 'voice-transcript-text')).toBe('what is the total');

    // 2. Final transcript goes to the assistant as a spoken turn.
    act(() => voice.hear('what is the total due'));
    await waitFor(() => has(tree, 'assistant-assistant'));
    const body = await calls.find(c => c.url.endsWith('/ai/chat'))!.json();
    expect(body).toEqual({ message: 'what is the total due', attachments: [], inputMode: 'voice' });
    expect(textOf(tree, 'voice-transcript-text')).toBe('what is the total due');

    // 3. The answer is read aloud, then the screen returns to idle.
    await waitFor(() => voice.spoken.length === 1);
    expect(voice.spoken[0]).toBe(ANSWER.answer);
    expect(textOf(tree, 'voice-phase')).toBe('Speaking… tap to stop');
    act(() => voice.finishSpeaking());
    await waitFor(() => textOf(tree, 'voice-phase') === 'Tap to speak');
    expect(has(tree, 'voice-context')).toBe(true);
  });

  it('does not speak when voice replies are turned off, but "Listen" still works', async () => {
    const voice = fakeVoice();
    setVoiceService(voice);
    const { tree } = render({ voiceReplies: false });
    expect(host(tree, 'voice-autospeak').props.value).toBe(false);

    await press(tree, 'voice-mic');
    act(() => voice.hear('total due'));
    await waitFor(() => has(tree, 'assistant-assistant'));
    await flush();
    expect(voice.spoken).toEqual([]);
    expect(textOf(tree, 'voice-phase')).toBe('Tap to speak');

    const listen = tree.root.findAll(n => typeof n.type === 'string' && /-listen$/.test(String(n.props.testID)));
    expect(listen).toHaveLength(1);
    await act(async () => listen[0].props.onClick());
    expect(voice.spoken).toEqual([ANSWER.answer]);
  });

  it('reports when nothing was understood and never calls the assistant', async () => {
    const voice = fakeVoice();
    setVoiceService(voice);
    const { tree } = render();
    await press(tree, 'voice-mic');
    act(() => voice.hear(''));
    await flush();
    expect(textOf(tree, 'voice-transcript-text')).toMatch(/Didn't catch that/);
    expect(calls.filter(c => c.url.endsWith('/ai/chat'))).toHaveLength(0);
    expect(textOf(tree, 'voice-phase')).toBe('Tap to speak');
  });

  it('hides the read-aloud toggle and explains when the device cannot listen', () => {
    setVoiceService(fakeVoice({ canSpeak: false, canListen: false }));
    const { tree } = render();
    expect(has(tree, 'voice-autospeak')).toBe(false);
    expect(textOf(tree, 'voice-phase')).toMatch(/not available/);
    expect(host(tree, 'voice-mic').props.accessibilityState.disabled).toBe(true);
  });
});

describe('ComposedVoiceService', () => {
  it('keeps recognition and synthesis apart and stops one before starting the other', async () => {
    const recognizer: SpeechService = {
      engine: 'r',
      isAvailable: () => true,
      start: jest.fn(async () => ({ transcript: 'hi', alternatives: ['hi'], confidence: null, durationMs: 1 })),
      stop: jest.fn(),
      cancel: jest.fn(),
    };
    const synthesizer: TextToSpeechService = {
      engine: 's',
      isAvailable: () => true,
      isSpeaking: () => false,
      speak: jest.fn(async () => undefined),
      stop: jest.fn(),
    };
    const service = new ComposedVoiceService(() => recognizer, () => synthesizer);

    expect((await service.listen()).transcript).toBe('hi');
    expect(synthesizer.stop).toHaveBeenCalledTimes(1); // no self-listening
    await service.speak('hello');
    expect(recognizer.cancel).toHaveBeenCalledTimes(1);
    expect(synthesizer.speak).toHaveBeenCalledWith('hello', undefined);
    service.stopAll();
    expect(recognizer.cancel).toHaveBeenCalledTimes(2);
    expect(synthesizer.stop).toHaveBeenCalledTimes(2);
  });
});
