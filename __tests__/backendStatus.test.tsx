import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { env } from '@/config';
import { BackendStatusScreen } from '@/features/devTools';
import { healthApi } from '@/services/api';
import { setupStore } from '@/store';
import { ThemeProvider, lightTheme } from '@/theme';

/* ------------------------------ fetch mock ------------------------------ */

type Responder = (req: Request) => Response | Promise<Response>;

const calls: Request[] = [];
let responder: Responder = () => healthy();

const healthy = () =>
  new Response(JSON.stringify({ status: 'healthy' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

beforeAll(() => {
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    return responder(req);
  }) as typeof fetch;
});

beforeEach(() => {
  calls.length = 0;
  responder = () => healthy();
});

/** Polls `predicate` inside `act` until it holds, or fails after `timeoutMs`. */
async function waitFor(predicate: () => boolean, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor: condition not met in time');
    }
    await act(() => new Promise<void>(r => setTimeout(r, 20)));
  }
}

/* ------------------------------ environment ----------------------------- */

describe('development environment', () => {
  it('points the Android emulator at the host machine, not localhost', () => {
    // 10.0.2.2 is the emulator's alias for the host; "localhost" would be
    // the emulator itself and every request would fail.
    expect(env.APP_ENV).toBe('development');
    expect(env.API_BASE_URL).toBe('http://10.0.2.2:8000');
    expect(env.API_BASE_URL).not.toMatch(/localhost|127\.0\.0\.1/);
  });
});

/* -------------------------------- endpoint ------------------------------- */

describe('healthApi.getHealth', () => {
  it('calls GET /api/v1/health with no bearer token', async () => {
    const store = setupStore();

    const result = await store.dispatch(
      healthApi.endpoints.getHealth.initiate(),
    );

    expect(result.data).toEqual({ status: 'healthy' });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/health');
    expect(calls[0].headers.get('Authorization')).toBeNull();
  });

  it('does not retry when the backend is down', async () => {
    responder = () => {
      throw new TypeError('Network request failed');
    };
    const store = setupStore();

    const result = await store.dispatch(
      healthApi.endpoints.getHealth.initiate(),
    );

    expect(result.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

/* --------------------------------- screen -------------------------------- */

describe('BackendStatusScreen', () => {
  function render() {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <Provider store={setupStore()}>
          <ThemeProvider theme={lightTheme}>
            <BackendStatusScreen />
          </ThemeProvider>
        </Provider>,
      );
    });
    return tree;
  }
  const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
    tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
  const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
    const c = host(tree, id).props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  };
  const settled = (tree: ReactTestRenderer.ReactTestRenderer) =>
    waitFor(() => textOf(tree, 'backend-status-label') !== 'Checking backend…');

  it('shows "Backend Connected" when /health answers healthy', async () => {
    const tree = render();
    expect(textOf(tree, 'backend-status-label')).toBe('Checking backend…');

    await settled(tree);

    expect(textOf(tree, 'backend-status-label')).toBe('Backend Connected');
    expect(() => host(tree, 'backend-status-error')).toThrow();
  });

  it('shows "Backend Unavailable" with a reason when the request fails', async () => {
    responder = () => {
      throw new TypeError('Network request failed');
    };
    const tree = render();

    await settled(tree);

    expect(textOf(tree, 'backend-status-label')).toBe('Backend Unavailable');
    expect(textOf(tree, 'backend-status-error')).toMatch(/network/i);
  });

  it('shows "Backend Unavailable" on a non-healthy HTTP response', async () => {
    responder = () =>
      new Response('Bad Gateway', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      });
    const tree = render();

    await settled(tree);

    expect(textOf(tree, 'backend-status-label')).toBe('Backend Unavailable');
  });

  it('re-probes when "Check again" is pressed', async () => {
    responder = () => {
      throw new TypeError('Network request failed');
    };
    const tree = render();
    await settled(tree);
    expect(textOf(tree, 'backend-status-label')).toBe('Backend Unavailable');

    responder = () => healthy();
    await act(async () => host(tree, 'backend-status-refresh').props.onClick());
    await waitFor(
      () => textOf(tree, 'backend-status-label') === 'Backend Connected',
    );

    expect(textOf(tree, 'backend-status-label')).toBe('Backend Connected');
    expect(calls).toHaveLength(2);
  });
});
