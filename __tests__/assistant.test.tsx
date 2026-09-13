import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import * as DocumentPicker from '@react-native-documents/picker';
import * as ImagePicker from 'react-native-image-picker';
import { AIAssistantScreen } from '@/features/aiAssistant';
import { sessionStarted } from '@/features/auth';
import { computeStats, setOCRService } from '@/services/ocr';
import { setSpeechService, type SpeechService } from '@/services/speech';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

/* ------------------------------ fetch mock ------------------------------ */

const calls: Request[] = [];
let responder: (req: Request) => Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const NO_MATERIAL = {
  conversationId: 'c1',
  messageId: 'm2',
  answer: 'I can help with your own material inside the app. Attach something with the + button.',
  sources: [],
  grounded: false,
  scope: 'no_material',
  suggestions: [],
  context: [],
  modelName: 'none',
  provider: 'app',
  retrievalMs: 0,
  generationMs: 0,
  processingMs: 3,
  createdAt: '2026-09-12T00:00:00Z',
};

const ANSWER = {
  conversationId: 'c1',
  messageId: 'm4',
  answer: 'The total due is 1,250.00 [1].',
  sources: [
    { chunkId: 'k1', documentId: 'd1', documentName: 'invoice.pdf', chunkIndex: 0, text: 'Total due: 1,250.00', startOffset: 0, endOffset: 19, similarity: 0.8, cited: true },
    { chunkId: 'k2', documentId: 'd1', documentName: 'invoice.pdf', chunkIndex: 3, text: 'Thank you for your business.', startOffset: 0, endOffset: 10, similarity: 0.3, cited: false },
  ],
  grounded: true,
  scope: 'material',
  suggestions: ['Summarise this document', 'What are the key dates and amounts?'],
  context: [{ type: 'document', documentId: 'd1', title: 'invoice.pdf', kind: null, indexed: true, note: null }],
  modelName: 'meta-llama/Llama-3.1-8B-Instruct',
  provider: 'huggingface',
  retrievalMs: 90,
  generationMs: 1200,
  processingMs: 1300,
  createdAt: '2026-09-12T00:00:00Z',
};

const UPLOADED_PDF = {
  id: 'd1', name: 'invoice.pdf', mimeType: 'application/pdf', sizeBytes: 2048, kind: 'pdf',
  status: 'uploaded', sha256: null, createdAt: '2026-09-12T00:00:00Z',
};
const UPLOADED_IMAGE = { ...UPLOADED_PDF, id: 'i1', name: 'photo.jpg', mimeType: 'image/jpeg', kind: 'image' };

function defaultResponder(req: Request): Response {
  if (req.url.endsWith('/documents/upload')) {
    return json(UPLOADED_PDF, 201);
  }
  if (req.url.endsWith('/ai/chat')) {
    return json(NO_MATERIAL);
  }
  return json({ detail: 'unexpected' }, 500);
}

const docs = (DocumentPicker as unknown as { __mock: { next: unknown } }).__mock;
const images = (ImagePicker as unknown as { __mock: { next: unknown; nextCamera: unknown } }).__mock;

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
  responder = defaultResponder;
  docs.next = null;
  images.next = { didCancel: true };
  images.nextCamera = { didCancel: true };
});
afterEach(() => {
  setOCRService(null);
  setSpeechService(null);
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render(params?: Record<string, unknown>) {
  const store = setupStore();
  store.dispatch(sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }));
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>
          <AIAssistantScreen
            navigation={navigation as never}
            route={{ key: 'k', name: 'AIAssistant', params } as never}
          />
        </ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return { tree, navigation };
}
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length > 0;
const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
  const c = host(tree, id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};
const hasMatch = (tree: ReactTestRenderer.ReactTestRenderer, pattern: RegExp) =>
  tree.root.findAll(n => typeof n.type === 'string' && pattern.test(String(n.props.testID))).length > 0;
const press = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  act(async () => host(tree, id).props.onClick());
const type = (tree: ReactTestRenderer.ReactTestRenderer, text: string) =>
  act(() => host(tree, 'assistant-input').props.onChangeText(text));

async function waitFor(pred: () => boolean, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timeout');
    }
    await act(() => new Promise<void>(r => setTimeout(r, 20)));
  }
}

// Request bodies can only be read once; cache them per request.
const bodyCache = new WeakMap<Request, Promise<unknown>>();
const chatBodies = async () =>
  Promise.all(
    calls
      .filter(c => c.url.endsWith('/ai/chat'))
      .map(c => {
        let cached = bodyCache.get(c);
        if (!cached) {
          cached = c.clone().json();
          bodyCache.set(c, cached);
        }
        return cached;
      }),
  );

describe('AIAssistantScreen', () => {
  it('starts empty and, with nothing attached, shows the assistant explaining its scope', async () => {
    const { tree } = render();
    expect(has(tree, 'assistant-empty')).toBe(true);
    expect(host(tree, 'assistant-send').props.accessibilityState.disabled).toBe(true);

    type(tree, 'Write me a poem');
    await press(tree, 'assistant-send');
    await waitFor(() => has(tree, 'assistant-assistant'));

    expect(await chatBodies()).toEqual([{ message: 'Write me a poem', attachments: [], inputMode: 'text' }]);
    expect(textOf(tree, 'assistant-user-text')).toBe('Write me a poem');
    expect(textOf(tree, 'assistant-assistant-text')).toContain('Attach something');
    expect(has(tree, 'assistant-empty')).toBe(false);
    expect(has(tree, 'assistant-context')).toBe(false);
  });

  it('queues OCR text handed over by another screen and sends it as an attachment', async () => {
    responder = req => (req.url.endsWith('/ai/chat') ? json(ANSWER) : defaultResponder(req));
    const { tree, navigation } = render({
      attach: { type: 'ocr', text: 'INVOICE 2026\nTotal due: 1,250.00', title: 'Recognised text' },
    });

    // The handoff is consumed once and shown as a removable chip.
    expect(navigation.setParams).toHaveBeenCalledWith({ attach: undefined, prefill: undefined });
    expect(hasMatch(tree, /^assistant-pending-p\d+$/)).toBe(true);
    expect(host(tree, 'assistant-send').props.accessibilityState.disabled).toBe(false); // attachment alone is enough

    type(tree, 'What is the total?');
    await press(tree, 'assistant-send');
    await waitFor(() => has(tree, 'assistant-assistant'));

    const [body] = await chatBodies();
    expect(body).toEqual({
      message: 'What is the total?',
      attachments: [{ type: 'ocr', text: 'INVOICE 2026\nTotal due: 1,250.00', title: 'Recognised text' }],
      inputMode: 'text',
    });
    // The sent message carries the chip; the answer carries cited sources, context and suggestions.
    expect(hasMatch(tree, /-chip-0$/)).toBe(true);
    expect(has(tree, 'assistant-pending')).toBe(false);
    expect(textOf(tree, 'assistant-assistant-text')).toContain('1,250.00');
    expect(hasMatch(tree, /-sources-chunk-0$/)).toBe(true);
    expect(hasMatch(tree, /-sources-chunk-3$/)).toBe(false); // uncited passages are collapsed
    expect(has(tree, 'assistant-context-0')).toBe(true);
    expect(has(tree, 'assistant-suggestion-0')).toBe(true);

    // A suggestion fills the composer; a follow-up reuses the conversation.
    await press(tree, 'assistant-suggestion-0');
    expect(host(tree, 'assistant-input').props.value).toBe('Summarise this document');
    await press(tree, 'assistant-send');
    await waitFor(() => calls.filter(c => c.url.endsWith('/ai/chat')).length === 2);
    const bodies = await chatBodies();
    expect(bodies[1]).toEqual({
      conversationId: 'c1',
      message: 'Summarise this document',
      attachments: [],
      inputMode: 'text',
    });

    // New chat clears everything.
    await press(tree, 'assistant-new');
    expect(has(tree, 'assistant-empty')).toBe(true);
    expect(has(tree, 'assistant-context')).toBe(false);
  });

  it('uploads a picked PDF before the turn and references it by id', async () => {
    responder = req =>
      req.url.endsWith('/ai/chat') ? json(ANSWER) : defaultResponder(req);
    const { tree } = render();

    await press(tree, 'assistant-attach');
    expect(has(tree, 'attachment-menu')).toBe(true);
    docs.next = { uri: 'content://x/invoice.pdf', name: 'invoice.pdf', size: 2048, type: 'application/pdf', error: null };
    await press(tree, 'attachment-menu-document');
    await waitFor(() => has(tree, 'assistant-pending'));
    expect(has(tree, 'attachment-menu')).toBe(false);

    type(tree, 'What is the total due?');
    await press(tree, 'assistant-send');
    await waitFor(() => has(tree, 'assistant-assistant'));

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/documents/upload');
    expect(calls[0].headers.get('Content-Type')).not.toBe('application/json');
    const [body] = await chatBodies();
    expect(body).toEqual({
      message: 'What is the total due?',
      attachments: [{ type: 'document', documentId: 'd1', title: 'invoice.pdf' }],
      inputMode: 'text',
    });
  });

  it('takes a photo, reads its text on the device and sends both', async () => {
    const recognize = jest.fn(async () => {
      const text = 'Total due: 1,250.00';
      const blocks = [{ text, frame: { x: 0, y: 0, width: 1, height: 1 }, lines: [{ text, frame: { x: 0, y: 0, width: 1, height: 1 } }] }];
      return { text, blocks, imageWidth: 1, imageHeight: 1, engine: 'mlkit-latin', durationMs: 1, stats: computeStats(blocks, text) };
    });
    setOCRService({ engine: 'fake', isAvailable: () => true, supportedScripts: () => ['latin'], recognize });
    responder = req =>
      req.url.endsWith('/documents/upload')
        ? json(UPLOADED_IMAGE, 201)
        : req.url.endsWith('/ai/chat')
        ? json({ ...ANSWER, context: [{ type: 'image', documentId: 'i1', title: 'photo.jpg', indexed: true }] })
        : defaultResponder(req);
    images.nextCamera = {
      assets: [{ uri: 'file:///photo.jpg', fileName: 'photo.jpg', fileSize: 4096, type: 'image/jpeg', width: 800, height: 600 }],
    };
    const { tree } = render();

    await press(tree, 'assistant-camera');
    await waitFor(() => has(tree, 'assistant-pending'));
    await press(tree, 'assistant-send'); // no text: the attachment alone is a valid turn
    await waitFor(() => has(tree, 'assistant-assistant'));

    expect(recognize).toHaveBeenCalledWith({ uri: 'file:///photo.jpg' });
    const [body] = await chatBodies();
    expect(body).toEqual({
      message: '',
      attachments: [{ type: 'image', documentId: 'i1', title: 'photo.jpg', text: 'Total due: 1,250.00' }],
      inputMode: 'text',
    });
    expect(textOf(tree, 'assistant-user-text')).toBe('Tell me about this.');
  });

  it('keeps the attachment for a retry when the turn fails', async () => {
    responder = req => (req.url.endsWith('/ai/chat') ? json({ detail: 'AI is down', code: 'AI_UNAVAILABLE' }, 503) : defaultResponder(req));
    const { tree } = render({ attach: { type: 'ocr', text: 'hello world', title: 'Recognised text' } });

    await press(tree, 'assistant-send');
    await waitFor(() => has(tree, 'assistant-assistant'));

    expect(textOf(tree, 'assistant-assistant-text')).toBe('AI is down');
    expect(hasMatch(tree, /^assistant-pending-p\d+$/)).toBe(true);
  });

  it('transcribes speech on the device into the composer and marks the turn as spoken', async () => {
    let resolveStart!: (value: { transcript: string; alternatives: string[]; confidence: number | null; durationMs: number }) => void;
    const speech: SpeechService = {
      engine: 'fake',
      isAvailable: () => true,
      start: jest.fn(
        (_options, listeners) =>
          new Promise(resolve => {
            resolveStart = resolve;
            listeners?.onPartial?.('what is');
          }),
      ),
      stop: jest.fn(() => resolveStart({ transcript: 'what is the total', alternatives: ['what is the total'], confidence: 0.9, durationMs: 1200 })),
      cancel: jest.fn(),
    };
    setSpeechService(speech);
    const { tree } = render();

    await press(tree, 'assistant-mic');
    await waitFor(() => has(tree, 'assistant-listening'));
    expect(speech.start).toHaveBeenCalledWith({ language: undefined }, expect.any(Object));

    await press(tree, 'assistant-mic'); // stop -> final transcript
    await waitFor(() => host(tree, 'assistant-input').props.value === 'what is the total');
    expect(has(tree, 'assistant-listening')).toBe(false);

    await press(tree, 'assistant-send');
    await waitFor(() => has(tree, 'assistant-assistant'));
    const [body] = await chatBodies();
    expect(body).toEqual({ message: 'what is the total', attachments: [], inputMode: 'voice' });
  });

  it('hides the microphone when voice input is unavailable', () => {
    setSpeechService({ engine: 'none', isAvailable: () => false, start: jest.fn(), stop: jest.fn(), cancel: jest.fn() });
    const { tree } = render();
    expect(has(tree, 'assistant-mic')).toBe(false);
  });
});
