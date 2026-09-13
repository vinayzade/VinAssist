/**
 * Render budgets for the list-heavy screens.
 *
 * `jest.renderCounter.js` counts, per commit, every function component that
 * actually performed work (via the React DevTools fiber hook). These tests
 * do something unrelated to the list rows, such as typing into a composer or
 * the search box, and assert that the rows are not re-rendered. The numbers
 * printed are the real render counts of the production components.
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { AIAssistantScreen } from '@/features/aiAssistant';
import { sessionStarted } from '@/features/auth';
import { DocumentChatScreen } from '@/features/documentAnalysis';
import { HistoryScreen } from '@/features/history';
import { setSpeechService } from '@/services/speech';
import { setVoiceService } from '@/services/voice';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

interface RenderCounts {
  get: (name: string) => number;
  reset: () => void;
  snapshot: () => Record<string, number>;
}
const renders = (globalThis as { __renderCounts?: RenderCounts }).__renderCounts!;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = require('react');
  return { ...actual, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

/* ------------------------------- fetch mock -------------------------------- */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ANSWER = {
  conversationId: 'c1', messageId: 'm', answer: 'The total due is 1,250.00 [1].',
  sources: [{ chunkId: 'k1', documentId: 'd1', documentName: 'invoice.pdf', chunkIndex: 0, text: 'Total due: 1,250.00', startOffset: 0, endOffset: 19, similarity: 0.8, cited: true }],
  grounded: true, scope: 'material', suggestions: ['Summarise this document'],
  context: [{ type: 'document', documentId: 'd1', title: 'invoice.pdf', indexed: true }],
  modelName: 'llama', provider: 'hf', retrievalMs: 1, generationMs: 2, processingMs: 3, createdAt: '2026-09-12T00:00:00Z',
};
const HISTORY_ITEMS = Array.from({ length: 20 }, (_, i) => ({
  id: `h${i}`, kind: 'ocr', title: `Receipt ${i}`, preview: `Coffee ${i}.50`, favourite: false,
  refId: `r${i}`, lastActivityAt: '2026-09-12T10:00:00Z', createdAt: '2026-09-12T10:00:00Z',
}));
const DOC_ANSWER = {
  documentId: 'd1', question: 'q', answer: 'Sixty days [1].',
  sources: [{ chunkId: 'c1', chunkIndex: 3, text: 'Either party may terminate with 60 days written notice.', startOffset: 0, endOffset: 10, similarity: 0.7, cited: true }],
  grounded: true, modelName: 'llama', provider: 'hf', retrievalMs: 1, generationMs: 2, processingMs: 3, createdAt: '2026-09-11T00:00:00Z',
};

beforeAll(() => {
  registerAppListeners();
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    if (url.pathname.endsWith('/ai/chat')) {
      return json(ANSWER);
    }
    if (url.pathname.endsWith('/history')) {
      return json({ items: HISTORY_ITEMS, page: 1, pageSize: 20, total: 20, hasMore: false });
    }
    if (url.pathname.endsWith('/index')) {
      return json({ documentId: 'd1', chunkCount: 7, characters: 4200, embeddingModel: 'm', processingMs: 9 });
    }
    if (url.pathname.endsWith('/ai/document-chat')) {
      return json(DOC_ANSWER);
    }
    return json({ detail: 'unexpected' }, 500);
  }) as typeof fetch;
  setSpeechService({ engine: 'none', isAvailable: () => false, start: jest.fn(), stop: jest.fn(), cancel: jest.fn() });
  // Speaking is available so the assistant hands rows a real `onSpeak` callback.
  setVoiceService({
    canListen: () => false, canSpeak: () => true, listen: jest.fn(), stopListening: jest.fn(),
    cancelListening: jest.fn(), speak: jest.fn(async () => undefined), stopSpeaking: jest.fn(),
    isSpeaking: () => false, stopAll: jest.fn(),
  });
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render(ui: React.ReactElement) {
  const store = setupStore();
  store.dispatch(sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }));
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>{ui}</ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}
const nav = () => ({ navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() }) as never;
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length > 0;
const count = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length;
async function waitFor(pred: () => boolean, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timeout');
    }
    await act(() => new Promise<void>(r => setTimeout(r, 20)));
  }
}
const typeInto = (tree: ReactTestRenderer.ReactTestRenderer, id: string, text: string) => {
  for (let i = 1; i <= text.length; i += 1) {
    act(() => host(tree, id).props.onChangeText(text.slice(0, i)));
  }
};
const report = (label: string, name: string, keystrokes: number, rows: number) => {
  const perKeystroke = renders.get(name) / keystrokes;
  console.log(`[perf] ${label}: ${name} renders per keystroke = ${perKeystroke} (rows on screen: ${rows})`);
  return perKeystroke;
};

describe('render budgets', () => {
  it('Assistant: typing in the composer does not re-render existing messages', async () => {
    const tree = render(<AIAssistantScreen navigation={nav()} route={{ key: 'k', name: 'AIAssistant' } as never} />);
    for (const [q, replies] of [['What is the total?', 1], ['And the date?', 2]] as const) {
      act(() => host(tree, 'assistant-input').props.onChangeText(q));
      await act(async () => host(tree, 'assistant-send').props.onClick());
      await waitFor(() => count(tree, 'assistant-assistant') === replies);
    }
    renders.reset();
    typeInto(tree, 'assistant-input', 'hello there');
    expect(renders.get('AIAssistantScreen')).toBeGreaterThan(0); // the screen itself does re-render
    expect(report('Assistant', 'AssistantEntryViewBase', 11, 4)).toBe(0);
    expect(report('Assistant', 'PassageSources', 11, 4)).toBe(0);
  });

  it('History: typing in search does not re-render the loaded rows until results change', async () => {
    const tree = render(<HistoryScreen navigation={nav()} route={{ key: 'k', name: 'History' } as never} />);
    await waitFor(() => has(tree, 'history-count'));
    renders.reset();
    typeInto(tree, 'history-search', 'rec'); // below the debounce: no request, rows must not move
    expect(renders.get('HistoryScreen')).toBeGreaterThan(0);
    expect(report('History', 'ActivityCardBase', 3, 20)).toBe(0);
  });

  it('Document chat: typing a question does not re-render earlier turns', async () => {
    const tree = render(
      <DocumentChatScreen
        navigation={nav()}
        route={{ key: 'k', name: 'DocumentChat', params: { documentId: 'd1', name: 'c.pdf', kind: 'pdf' } } as never}
      />,
    );
    await waitFor(() => has(tree, 'document-chat-index-info'));
    act(() => host(tree, 'document-chat-input').props.onChangeText('How much notice?'));
    await act(async () => host(tree, 'document-chat-send').props.onClick());
    await waitFor(() => has(tree, 'chat-assistant'));
    renders.reset();
    typeInto(tree, 'document-chat-input', 'and the fee?');
    expect(renders.get('DocumentChatScreen')).toBeGreaterThan(0);
    expect(report('Document chat', 'EntryBase', 12, 2)).toBe(0);
  });
});
