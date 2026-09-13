/**
 * Custom hooks through `renderHook`: form control, debouncing, file
 * selection, voice input, and the assistant conversation hook.
 */

import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from '@react-native-documents/picker';
import { useAssistant, useVoiceInput } from '@/features/aiAssistant';
import { useDebounce } from '@/hooks/useDebounce';
import { useFileSelection } from '@/hooks/useFileSelection';
import { useForm } from '@/hooks/useForm';
import { SpeechError } from '@/services/speech';
import { setVoiceService, type VoiceService } from '@/services/voice';
import { rules } from '@/utils/validation';
import { fixtures, installFetchMock, type FetchMock } from '../../test-utils/fetchMock';
import { renderHookWithProviders } from '../../test-utils/render';

/* --------------------------------- useForm --------------------------------- */

describe('useForm', () => {
  interface Values {
    email: string;
    name: string;
  }
  const schema = {
    email: [rules.required('Email is required'), rules.email()],
    name: [rules.required('Name is required')],
  };

  it('validates on submit, exposes field errors only once touched or submitted, and clears them on edit', async () => {
    const onSubmit = jest.fn();
    const { result } = await renderHook(() =>
      useForm<Values>({ initialValues: { email: '', name: '' }, schema, onSubmit }),
    );

    expect(result.current.field('email').errorText).toBeUndefined();
    await act(async () => result.current.handleSubmit());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.field('email').errorText).toBe('Email is required');
    expect(result.current.field('name').errorText).toBe('Name is required');
    expect(result.current.isValid).toBe(false);

    await act(async () => result.current.field('email').onChangeText('  vinay@example.com '));
    expect(result.current.field('email').errorText).toBeUndefined(); // cleared as soon as the user edits
    await act(async () => result.current.field('name').onChangeText('Vinay'));

    await act(async () => result.current.handleSubmit());
    expect(onSubmit).toHaveBeenCalledWith({ email: 'vinay@example.com', name: 'Vinay' }, expect.any(Object));
  });

  it('lets the submit handler attach server-side field and form errors', async () => {
    const { result } = await renderHook(() =>
      useForm<Values>({
        initialValues: { email: 'a@b.com', name: 'A' },
        schema,
        onSubmit: async (_values, helpers) => {
          helpers.setFieldErrors({ email: 'Already registered' });
          helpers.setFormError('Please fix the highlighted field.');
        },
      }),
    );
    await act(async () => result.current.handleSubmit());
    expect(result.current.field('email').errorText).toBe('Already registered');
    expect(result.current.formError).toBe('Please fix the highlighted field.');
    expect(result.current.isSubmitting).toBe(false);
  });
});

/* ------------------------------- useDebounce ------------------------------- */

describe('useDebounce', () => {
  it('only settles on the last value after the delay', async () => {
    const { result, rerender } = await renderHook(({ value }: { value: string }) => useDebounce(value, 120), {
      initialProps: { value: 'a' },
    });
    expect(result.current).toBe('a');
    await rerender({ value: 'ab' });
    await rerender({ value: 'abc' });
    expect(result.current).toBe('a'); // nothing settles before the delay
    await waitFor(() => expect(result.current).toBe('abc'));
    // The intermediate value never appeared.
    expect(result.current).not.toBe('ab');
  });
});

/* ---------------------------- useFileSelection ---------------------------- */

describe('useFileSelection', () => {
  const docs = (DocumentPicker as unknown as { __mock: { next: unknown } }).__mock;

  it('keeps a valid pick, reports cancellation as null, and surfaces validation errors', async () => {
    const { result } = await renderHook(() => useFileSelection({ kinds: ['pdf'] }));

    docs.next = null; // cancelled
    await act(async () => {
      expect(await result.current.pickDocument()).toBeNull();
    });
    expect(result.current.file).toBeNull();

    docs.next = { uri: 'content://x/big.pdf', name: 'big.pdf', size: 50 * 1024 * 1024, type: 'application/pdf', error: null };
    await act(async () => {
      await result.current.pickDocument();
    });
    expect(result.current.file).toBeNull();
    expect(result.current.errorCode).toBe('too-large');
    expect(result.current.error).toMatch(/limit/);

    docs.next = { uri: 'content://x/ok.pdf', name: 'ok.pdf', size: 2048, type: 'application/pdf', error: null };
    await act(async () => {
      await result.current.pickDocument();
    });
    expect(result.current.file).toMatchObject({ name: 'ok.pdf', kind: 'pdf', extension: 'pdf' });
    expect(result.current.error).toBeNull();

    await act(async () => result.current.clear());
    expect(result.current.file).toBeNull();
  });
});

/* ------------------------------ useVoiceInput ------------------------------ */

function fakeVoice(overrides: Partial<VoiceService> = {}): VoiceService {
  return {
    canListen: () => true,
    canSpeak: () => true,
    listen: jest.fn(async () => ({ transcript: 'hello world', alternatives: ['hello world'], confidence: 0.9, durationMs: 500 })),
    stopListening: jest.fn(),
    cancelListening: jest.fn(),
    speak: jest.fn(async () => undefined),
    stopSpeaking: jest.fn(),
    isSpeaking: () => false,
    stopAll: jest.fn(),
    ...overrides,
  };
}

describe('useVoiceInput', () => {
  afterEach(() => setVoiceService(null));

  it('listens, hands the final transcript back, and returns to idle', async () => {
    const voice = fakeVoice();
    setVoiceService(voice);
    const onTranscript = jest.fn();
    const { result } = await renderHook(() => useVoiceInput({ onTranscript }));

    expect(result.current.isAvailable).toBe(true);
    await act(async () => result.current.toggle());
    expect(onTranscript).toHaveBeenCalledWith('hello world');
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('reports silence and recognition failures as user-facing errors', async () => {
    setVoiceService(
      fakeVoice({ listen: jest.fn(async () => ({ transcript: '', alternatives: [], confidence: null, durationMs: 1 })) }),
    );
    const { result } = await renderHook(() => useVoiceInput({ onTranscript: jest.fn() }));
    await act(async () => result.current.toggle());
    expect(result.current.error).toMatch(/Didn't catch that/);

    setVoiceService(
      fakeVoice({
        listen: jest.fn(async () => {
          throw new SpeechError('The speech service could not be reached.', 'network');
        }),
      }),
    );
    const failing = await renderHook(() => useVoiceInput({ onTranscript: jest.fn() }));
    await act(async () => failing.result.current.toggle());
    expect(failing.result.current.error).toBe('The speech service could not be reached.');
  });

  it('is unavailable without a recogniser', async () => {
    setVoiceService(fakeVoice({ canListen: () => false }));
    const { result } = await renderHook(() => useVoiceInput({ onTranscript: jest.fn() }));
    expect(result.current.isAvailable).toBe(false);
  });
});

/* ------------------------------- useAssistant ------------------------------ */

describe('useAssistant', () => {
  let api: FetchMock;
  beforeEach(() => {
    api = installFetchMock();
  });

  const answer = (text: string, conversationId = 'c1') => ({
    conversationId, messageId: 'm', answer: text, sources: [], grounded: true, scope: 'material',
    suggestions: ['Summarise this'], context: [{ type: 'ocr', title: 'Scan', indexed: null }],
    modelName: 'llama', provider: 'hf', retrievalMs: 1, generationMs: 2, processingMs: 3, createdAt: '2026-09-12T00:00:00Z',
  });

  it('sends a turn with inline OCR text, keeps the conversation id, and exposes suggestions', async () => {
    api.on('POST', '/api/v1/ai/chat', () => api.json(answer('The total is 1,250.00')));
    const { result } = await renderHookWithProviders(() => useAssistant());

    await act(async () => {
      await result.current.send({
        text: 'What is the total?',
        attachments: [{ id: 'p1', kind: 'ocr', title: 'Scan', text: 'Total due: 1,250.00' }],
      });
    });
    expect(api.calls('POST', '/api/v1/ai/chat')[0].body).toEqual({
      message: 'What is the total?',
      attachments: [{ type: 'ocr', text: 'Total due: 1,250.00', title: 'Scan' }],
      inputMode: 'text',
    });
    expect(result.current.entries.map(e => e.role)).toEqual(['user', 'assistant']);
    expect(result.current.entries[1].content).toBe('The total is 1,250.00');
    expect(result.current.conversationId).toBe('c1');
    expect(result.current.suggestions).toEqual(['Summarise this']);
    expect(result.current.context[0].title).toBe('Scan');

    await act(async () => {
      await result.current.send({ text: 'And the date?', attachments: [] });
    });
    expect(api.calls('POST', '/api/v1/ai/chat')[1].body).toMatchObject({ conversationId: 'c1' });
  });

  it('clips over-long OCR text to the backend limit', async () => {
    api.on('POST', '/api/v1/ai/chat', () => api.json(answer('ok')));
    const { result } = await renderHookWithProviders(() => useAssistant());
    await act(async () => {
      await result.current.send({
        text: 'summarise',
        attachments: [{ id: 'p1', kind: 'ocr', title: 'Long', text: 'x'.repeat(30_000) }],
      });
    });
    const body = api.calls('POST', '/api/v1/ai/chat')[0].body as { attachments: { text: string }[] };
    expect(body.attachments[0].text.length).toBeLessThanOrEqual(20_000);
    expect(body.attachments[0].text.endsWith('…')).toBe(true);
  });

  it('a failed turn becomes an error entry and resolves null', async () => {
    api.on('POST', '/api/v1/ai/chat', () => api.json(fixtures.error('AI is down', 'AI_UNAVAILABLE'), 503));
    const { result } = await renderHookWithProviders(() => useAssistant());
    let outcome: unknown = 'unset';
    await act(async () => {
      outcome = await result.current.send({ text: 'hello', attachments: [] });
    });
    expect(outcome).toBeNull();
    expect(result.current.entries[1]).toMatchObject({ role: 'assistant', error: true, content: 'AI is down' });
    expect(result.current.isSending).toBe(false);
  });

  it('resumes a saved conversation and newConversation clears it', async () => {
    api.on('GET', '/api/v1/ai/conversations/c9', () =>
      api.json({
        id: 'c9', title: 'Invoice chat',
        messages: [
          { id: 'm1', role: 'user', content: 'Total?', attachments: [{ type: 'ocr', title: 'Scan' }], sources: [], grounded: null, createdAt: 'x' },
          { id: 'm2', role: 'assistant', content: '1,250.00', attachments: [], sources: [], grounded: true, createdAt: 'x' },
        ],
        context: [{ type: 'ocr', title: 'Scan' }],
        createdAt: 'x', updatedAt: 'x',
      }),
    );
    const { result } = await renderHookWithProviders(() => useAssistant());
    await act(async () => {
      await result.current.resume('c9');
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(result.current.conversationId).toBe('c9');
    expect(result.current.entries[0].attachments).toEqual([{ type: 'ocr', title: 'Scan' }]);

    await act(async () => result.current.newConversation());
    expect(result.current.entries).toEqual([]);
    expect(result.current.conversationId).toBeNull();
  });
});
