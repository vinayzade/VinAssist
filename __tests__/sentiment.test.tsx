import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { sessionStarted } from '@/features/auth';
import { SentimentScreen } from '@/features/sentiment';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

const calls: Request[] = [];
let responder: () => Response = () =>
  new Response(
    JSON.stringify({
      sentiment: 'POSITIVE',
      confidence: 0.97,
      explanation: null,
      scores: { positive: 0.97, neutral: 0.02, negative: 0.01 },
      id: 's1',
      provider: 'huggingface',
      model: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
      processingMs: 412,
      createdAt: '2026-09-11T00:00:00Z',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

beforeAll(() => {
  registerAppListeners();
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    return responder();
  }) as typeof fetch;
});
beforeEach(() => {
  calls.length = 0;
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render() {
  const store = setupStore();
  store.dispatch(
    sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }),
  );
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>
          <SentimentScreen />
        </ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return tree;
}
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
  const c = host(tree, id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};
const flush = () => act(() => new Promise<void>(r => setTimeout(r, 0)));

describe('SentimentScreen', () => {
  it('posts the text to /ai/sentiment and renders the uppercase label contract', async () => {
    const tree = render();
    const input = tree.root.findByProps({ placeholder: 'Type or paste text…' });

    act(() => input.props.onChangeText('The application is excellent.'));
    const button = tree.root.find(
      n => typeof n.type === 'string' && n.props.accessibilityRole === 'button' && !n.props.accessibilityState?.disabled,
    );
    await act(async () => button.props.onClick());
    await flush();

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/ai/sentiment');
    expect(await calls[0].json()).toEqual({ text: 'The application is excellent.' });
    expect(calls[0].headers.get('Authorization')).toBe('Bearer t');
    expect(textOf(tree, 'sentiment-label')).toBe('Positive · 97%');
    expect(textOf(tree, 'sentiment-meta')).toContain('412 ms');
  });

  it('shows provider errors with the backend message', async () => {
    responder = () =>
      new Response(JSON.stringify({ detail: 'The AI service took too long to respond.', code: 'AI_TIMEOUT' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' },
      });
    const tree = render();
    act(() => tree.root.findByProps({ placeholder: 'Type or paste text…' }).props.onChangeText('slow'));
    const button = tree.root.find(
      n => typeof n.type === 'string' && n.props.accessibilityRole === 'button' && !n.props.accessibilityState?.disabled,
    );
    await act(async () => button.props.onClick());
    await flush();

    const texts = tree.root.findAllByType('Text' as never).map(n => String(n.props.children));
    expect(texts.some(t => t.includes('took too long'))).toBe(true);
  });
});
