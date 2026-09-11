import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { sessionStarted } from '@/features/auth';
import { DocumentChatScreen } from '@/features/documentAnalysis';
import { computeStats, setOCRService } from '@/services/ocr';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

const calls: Request[] = [];
let responder: (req: Request) => Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const INDEXED = { documentId: 'd1', chunkCount: 7, characters: 4200, embeddingModel: 'all-MiniLM', processingMs: 900 };
const ANSWER = {
  documentId: 'd1',
  question: 'How much notice?',
  answer: 'Sixty days of written notice are required [1].',
  sources: [
    { chunkId: 'c1', chunkIndex: 3, text: 'Either party may terminate with 60 days written notice.', startOffset: 0, endOffset: 10, similarity: 0.71, cited: true },
    { chunkId: 'c2', chunkIndex: 5, text: 'Support hours are 9am to 6pm.', startOffset: 0, endOffset: 10, similarity: 0.4, cited: false },
  ],
  grounded: true,
  modelName: 'meta-llama/Llama-3.1-8B-Instruct',
  provider: 'huggingface',
  retrievalMs: 120,
  generationMs: 1400,
  processingMs: 1600,
  createdAt: '2026-09-11T00:00:00Z',
};

function defaultResponder(req: Request): Response {
  if (req.url.endsWith('/index')) {
    return json(INDEXED);
  }
  if (req.url.endsWith('/ai/document-chat')) {
    return json(ANSWER);
  }
  return json({ detail: 'unexpected' }, 500);
}

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
});
afterEach(() => setOCRService(null));

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render(params: { kind: 'pdf' | 'image'; localUri?: string }) {
  const store = setupStore();
  store.dispatch(sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }));
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>
          <DocumentChatScreen
            navigation={{ navigate: jest.fn(), goBack: jest.fn() } as never}
            route={{ key: 'k', name: 'DocumentChat', params: { documentId: 'd1', name: 'contract.pdf', ...params } } as never}
          />
        </ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length > 0;
const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
  const c = host(tree, id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};
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

describe('DocumentChatScreen', () => {
  it('indexes a PDF on open, then asks with history and shows cited sources', async () => {
    const tree = render({ kind: 'pdf' });
    expect(has(tree, 'document-chat-indexing')).toBe(true);
    await waitFor(() => has(tree, 'document-chat-index-info'));

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/documents/d1/index');
    expect(await calls[0].json()).toEqual({ force: false });
    expect(textOf(tree, 'document-chat-index-info')).toContain('7 passages');

    act(() => host(tree, 'document-chat-input').props.onChangeText('How much notice?'));
    await act(async () => host(tree, 'document-chat-send').props.onClick());
    await waitFor(() => has(tree, 'chat-assistant'));

    expect(calls[1].url).toBe('http://10.0.2.2:8000/api/v1/ai/document-chat');
    expect(await calls[1].json()).toEqual({ documentId: 'd1', question: 'How much notice?', history: [] });
    expect(textOf(tree, 'chat-assistant-text')).toContain('Sixty days');
    const cited = tree.root.findAll(n => typeof n.type === 'string' && /sources-chunk-3$/.test(String(n.props.testID)));
    expect(cited).toHaveLength(1); // only the cited passage is shown by default
    expect(tree.root.findAll(n => typeof n.type === 'string' && /sources-chunk-5$/.test(String(n.props.testID)))).toHaveLength(0);

    // Follow-up carries the previous turns as history.
    act(() => host(tree, 'document-chat-input').props.onChangeText('And the fee?'));
    await act(async () => host(tree, 'document-chat-send').props.onClick());
    await flush();
    const followUp = await calls[2].json();
    expect(followUp.history).toEqual([
      { role: 'user', content: 'How much notice?' },
      { role: 'assistant', content: ANSWER.answer },
    ]);
  });

  it('runs on-device OCR for images and sends the text with the index request', async () => {
    const recognize = jest.fn(async () => {
      const text = 'INVOICE 2026-001\nTotal due: 1,250.00';
      const blocks = [{ text, frame: { x: 0, y: 0, width: 1, height: 1 }, lines: [{ text, frame: { x: 0, y: 0, width: 1, height: 1 } }] }];
      return { text, blocks, imageWidth: 1, imageHeight: 1, engine: 'mlkit-latin', durationMs: 1, stats: computeStats(blocks, text) };
    });
    setOCRService({ engine: 'fake', isAvailable: () => true, supportedScripts: () => ['latin'], recognize });

    const tree = render({ kind: 'image', localUri: 'file:///scan.jpg' });
    await waitFor(() => has(tree, 'document-chat-index-info'));

    expect(recognize).toHaveBeenCalledWith({ uri: 'file:///scan.jpg' });
    expect(await calls[0].json()).toEqual({ text: 'INVOICE 2026-001\nTotal due: 1,250.00', force: false });
  });

  it('explains when the document cannot be indexed', async () => {
    responder = req =>
      req.url.endsWith('/index')
        ? json({ detail: 'This document has no text to index.', code: 'DOCUMENT_NOT_INDEXABLE' }, 422)
        : defaultResponder(req);
    const tree = render({ kind: 'pdf' });
    await waitFor(() => has(tree, 'document-chat-index-error'));
    expect(textOf(tree, 'document-chat-index-error')).toMatch(/no readable text/);
    expect(host(tree, 'document-chat-send').props.accessibilityState?.disabled).toBe(true);
  });

  it('shows the not-found state when the answer is not grounded', async () => {
    responder = req =>
      req.url.endsWith('/ai/document-chat')
        ? json({ ...ANSWER, answer: "I couldn't find that in the document.", grounded: false, sources: ANSWER.sources.map(s => ({ ...s, cited: false })) })
        : defaultResponder(req);
    const tree = render({ kind: 'pdf' });
    await waitFor(() => has(tree, 'document-chat-index-info'));
    act(() => host(tree, 'document-chat-input').props.onChangeText('Who won the world cup?'));
    await act(async () => host(tree, 'document-chat-send').props.onClick());
    await waitFor(() => has(tree, 'chat-assistant'));

    const texts = tree.root.findAllByType('Text' as never).map(n => String(n.props.children));
    expect(texts).toContain('Not found in the document.');
  });
});
