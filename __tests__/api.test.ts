import {
  logout,
  sessionExpired,
  sessionService,
  sessionStarted,
} from '@/features/auth';
import {
  aiApi,
  authApi,
  baseApi,
  documentApi,
  getApiErrorMessage,
  historyApi,
  isRefreshInFlight,
  userApi,
  type ApiError,
} from '@/services/api';
import { secureStorage, storage } from '@/services/storage';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';

/* ------------------------------ fetch mock ------------------------------ */

type Responder = (req: Request) => Response | Promise<Response>;

const calls: Request[] = [];
let responders: Responder[] = [];
let fallback: Responder = () => json({ detail: 'unexpected call' }, 500);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/** Queue responses in order; once the queue is empty `fallback` answers. */
function respondWith(...list: Responder[]) {
  responders = list;
}

beforeAll(() => {
  registerAppListeners();
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    const responder = responders.shift() ?? fallback;
    return responder(req);
  }) as typeof fetch;
});

beforeEach(async () => {
  calls.length = 0;
  responders = [];
  fallback = () => json({ detail: 'unexpected call' }, 500);
  await sessionService.clear();
  await storage.clear();
});

const session = {
  token: 'access-1',
  refreshToken: 'refresh-1',
  user: { id: '1', name: 'Vin', email: 'vin@example.com' },
};

async function signedInStore() {
  const store = setupStore();
  store.dispatch(sessionStarted(session));
  await flush();
  return store;
}

const flush = () => new Promise<void>(r => setTimeout(() => r(), 0));
const settle = () => new Promise<void>(r => setTimeout(() => r(), 600));

/* -------------------------------- headers ------------------------------- */

describe('baseApi transport', () => {
  it('targets /api/v1 and sends the bearer token and JSON headers', async () => {
    const store = await signedInStore();
    respondWith(() =>
      json({ id: '1', name: 'Vin', email: 'v@e.com', createdAt: 'x' }),
    );

    await store.dispatch(userApi.endpoints.getMe.initiate());

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/users/me');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer access-1');
    expect(calls[0].headers.get('Accept')).toBe('application/json');
    expect(calls[0].headers.get('Content-Type')).toBe('application/json');
    await settle();
  });

  it('omits the bearer for skipAuth endpoints such as login', async () => {
    const store = await signedInStore();
    respondWith(() =>
      json({ user: session.user, accessToken: 'a2', refreshToken: 'r2' }),
    );

    const result = await store.dispatch(
      authApi.endpoints.login.initiate({ email: 'e', password: 'p' }),
    );

    expect(calls[0].headers.get('Authorization')).toBeNull();
    expect(calls[0].method).toBe('POST');
    expect('data' in result && result.data).toEqual({
      user: session.user,
      token: 'a2',
      refreshToken: 'r2',
    });
    // Slice mirrored the session and the listeners persisted the tokens.
    expect(sessionService.getAccessToken()).toBe('a2');
    await flush();
    expect(await secureStorage.getAccessToken()).toBe('a2');
    expect(await secureStorage.getRefreshToken()).toBe('r2');
  });

  it('lets fetch set the multipart boundary for FormData uploads', async () => {
    const store = await signedInStore();
    respondWith(() => json({ id: 'd1', status: 'uploaded' }));

    await store.dispatch(
      documentApi.endpoints.uploadDocument.initiate({
        uri: 'file:///a.pdf',
        name: 'a.pdf',
        type: 'application/pdf',
      }),
    );

    expect(calls[0].headers.get('Content-Type')).not.toBe('application/json');
  });
});

/* --------------------------- token refresh flow -------------------------- */

describe('automatic token refresh', () => {
  it('refreshes on 401, stores the new tokens, and retries the request', async () => {
    const store = await signedInStore();
    respondWith(
      () => text('Unauthorized', 401),
      () => json({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
      () =>
        json({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
    );

    const result = await store.dispatch(
      historyApi.endpoints.listHistory.initiate(),
    );

    expect(calls.map(c => new URL(c.url).pathname)).toEqual([
      '/api/v1/history',
      '/api/v1/auth/refresh',
      '/api/v1/history',
    ]);
    // Refresh call: no stale bearer, correct body.
    expect(calls[1].headers.get('Authorization')).toBeNull();
    expect(await calls[1].json()).toEqual({ refreshToken: 'refresh-1' });
    // Retry used the new token.
    expect(calls[2].headers.get('Authorization')).toBe('Bearer access-2');

    expect('data' in result && result.data).toMatchObject({ total: 0 });
    expect(sessionService.getAccessToken()).toBe('access-2');
    expect(await secureStorage.getAccessToken()).toBe('access-2');
    expect(await secureStorage.getRefreshToken()).toBe('refresh-2');
    expect(isRefreshInFlight()).toBe(false);
    await settle();
  });

  it('coalesces concurrent 401s into a single refresh call', async () => {
    const store = await signedInStore();
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));

    fallback = async req => {
      const path = new URL(req.url).pathname;
      if (path === '/api/v1/auth/refresh') {
        await gate; // hold the refresh so both 401s are in flight together
        return json({ accessToken: 'access-2' });
      }
      if (req.headers.get('Authorization') !== 'Bearer access-2') {
        return text('Unauthorized', 401);
      }
      return path === '/api/v1/users/me'
        ? json({ id: '1', name: 'Vin', email: 'v@e.com', createdAt: 'x' })
        : json({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false });
    };

    const a = store.dispatch(userApi.endpoints.getMe.initiate());
    const b = store.dispatch(historyApi.endpoints.listHistory.initiate());
    await flush();
    expect(isRefreshInFlight()).toBe(true);
    release();
    const [ra, rb] = await Promise.all([a, b]);

    const refreshCalls = calls.filter(
      c => new URL(c.url).pathname === '/api/v1/auth/refresh',
    );
    expect(refreshCalls).toHaveLength(1);
    expect('data' in ra && ra.data).toBeTruthy();
    expect('data' in rb && rb.data).toBeTruthy();
    // Refresh without rotation keeps the old refresh token.
    expect(await secureStorage.getRefreshToken()).toBe('refresh-1');
    await settle();
  });

  it('ends the session when the refresh token is rejected', async () => {
    const store = await signedInStore();
    respondWith(
      () => text('Unauthorized', 401),
      () => json({ detail: 'Refresh token expired' }, 401),
    );

    const result = await store.dispatch(userApi.endpoints.getMe.initiate());

    expect('error' in result && (result.error as ApiError).status).toBe(401);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(sessionService.getAccessToken()).toBeNull();
    expect(store.getState().auth.user).toBeNull();
    await flush();
    expect(await secureStorage.getAccessToken()).toBeNull();
    expect(await secureStorage.getRefreshToken()).toBeNull();
    await settle();
  });

  it('ends the session immediately when there is no refresh token', async () => {
    const store = setupStore();
    store.dispatch(
      sessionStarted({ token: 'only-access', user: session.user }),
    );
    await flush();
    respondWith(() => text('Unauthorized', 401));

    await store.dispatch(userApi.endpoints.getMe.initiate());

    expect(calls).toHaveLength(1); // no refresh attempted
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(sessionService.getAccessToken()).toBeNull();
    await settle();
  });

  it('keeps the session when the refresh call itself fails on the network', async () => {
    const store = await signedInStore();
    respondWith(
      () => text('Unauthorized', 401),
      () => {
        throw new TypeError('Network request failed');
      },
    );

    const result = await store.dispatch(
      aiApi.endpoints.analyzeSentiment.initiate({ text: 'hi' }),
    );

    expect('error' in result && (result.error as ApiError).status).toBe(401);
    expect(sessionService.getAccessToken()).toBe('access-1');
    expect(await secureStorage.getRefreshToken()).toBe('refresh-1');
  });

  it('does not try to refresh when signed out', async () => {
    const store = setupStore();
    respondWith(() => json({ detail: 'Invalid credentials' }, 401));

    const result = await store.dispatch(
      authApi.endpoints.login.initiate({ email: 'e', password: 'bad' }),
    );

    expect(calls).toHaveLength(1);
    expect('error' in result && getApiErrorMessage(result.error)).toBe(
      'Invalid credentials',
    );
  });
});

/* ------------------------------ error handling --------------------------- */

describe('error normalisation', () => {
  it('reads FastAPI `detail` strings and validation arrays', async () => {
    const store = await signedInStore();
    respondWith(() =>
      json(
        {
          detail: [
            { loc: ['body', 'email'], msg: 'field required', type: 'x' },
          ],
        },
        422,
      ),
    );
    const r1 = await store.dispatch(
      userApi.endpoints.updateMe.initiate({ email: '' }),
    );
    expect('error' in r1 && r1.error).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'email: field required',
    });

    respondWith(() => json({ detail: 'Nope', code: 'E_NOPE' }, 403));
    const r2 = await store.dispatch(userApi.endpoints.deleteMe.initiate());
    expect('error' in r2 && r2.error).toMatchObject({
      status: 403,
      code: 'E_NOPE',
      message: 'Nope',
    });
  });

  it('maps transport failures to NETWORK with a friendly message', async () => {
    const store = await signedInStore();
    respondWith(() => {
      throw new TypeError('Network request failed');
    });
    const r = await store.dispatch(
      aiApi.endpoints.chat.initiate({ messages: [] }),
    );
    expect('error' in r && r.error).toMatchObject({ status: 'NETWORK' });
    expect('error' in r && getApiErrorMessage(r.error)).toMatch(/connection/);
  });

  it('times out slow requests using the endpoint budget', async () => {
    const store = await signedInStore();
    const probe = baseApi.injectEndpoints({
      endpoints: build => ({
        slow: build.mutation<void, void>({
          query: () => ({ url: '/slow', method: 'POST' }),
          extraOptions: { timeout: 30 },
        }),
      }),
    });
    respondWith(
      req =>
        new Promise<Response>((_resolve, reject) => {
          req.signal.addEventListener('abort', () =>
            reject(
              Object.assign(new Error('Timed out'), { name: 'TimeoutError' }),
            ),
          );
        }),
    );

    const r = await store.dispatch(probe.endpoints.slow.initiate());
    expect('error' in r && r.error).toMatchObject({ status: 'TIMEOUT' });
  });
});

/* -------------------------------- retries ------------------------------- */

describe('retry policy', () => {
  it('retries idempotent queries on 5xx with backoff, then succeeds', async () => {
    const store = await signedInStore();
    respondWith(
      () => json({ detail: 'down' }, 503),
      () => json({ detail: 'down' }, 503),
      () =>
        json({ items: [], page: 1, pageSize: 20, total: 0, hasMore: false }),
    );

    const r = await store.dispatch(historyApi.endpoints.listHistory.initiate());

    expect(calls).toHaveLength(3);
    expect('data' in r && r.data).toMatchObject({ total: 0 });
    await settle();
  }, 10_000);

  it('never retries mutations', async () => {
    const store = await signedInStore();
    respondWith(() => json({ detail: 'down' }, 503));

    const r = await store.dispatch(
      aiApi.endpoints.chat.initiate({ messages: [] }),
    );

    expect(calls).toHaveLength(1);
    expect('error' in r && (r.error as ApiError).status).toBe(503);
  });

  it('does not retry client errors', async () => {
    const store = await signedInStore();
    respondWith(() => json({ detail: 'missing' }, 404));

    await store.dispatch(historyApi.endpoints.getHistoryItem.initiate('x'));

    expect(calls).toHaveLength(1);
    await settle();
  });
});

/* -------------------------------- sign out ------------------------------- */

describe('sign out', () => {
  it('revokes server-side, clears tokens, and resets the API cache', async () => {
    const store = await signedInStore();
    respondWith(() =>
      json({ id: '1', name: 'Vin', email: 'v@e.com', createdAt: 'x' }),
    );
    await store.dispatch(userApi.endpoints.getMe.initiate());
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1);

    respondWith(() => json({}));
    store.dispatch(logout());
    await flush();

    expect(calls.at(-1) && new URL(calls.at(-1)!.url).pathname).toBe(
      '/api/v1/auth/logout',
    );
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(sessionService.getAccessToken()).toBeNull();
    expect(await secureStorage.getAccessToken()).toBeNull();
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0);
    await settle();
  });

  it('sessionExpired clears the cache without calling the server', async () => {
    const store = await signedInStore();
    store.dispatch(sessionExpired());
    await flush();
    expect(calls).toHaveLength(0);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(sessionService.getAccessToken()).toBeNull();
  });
});
