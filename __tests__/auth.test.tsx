import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import {
  classifyAuthError,
  initializeSession,
  sessionExpired,
  sessionService,
  sessionStarted,
  useLoginForm,
} from '@/features/auth';
import {
  loginSchema,
  registerSchema,
} from '@/features/auth/services/authValidation';
import { secureStorage, storage } from '@/services/storage';
import { setupStore, type AppStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';
import { validate } from '@/utils/validation';

/* ------------------------------ fetch mock ------------------------------ */

type Responder = (req: Request) => Response | Promise<Response>;
const calls: Request[] = [];
let queue: Responder[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const networkDown: Responder = () => {
  throw new TypeError('Network request failed');
};

beforeAll(() => {
  registerAppListeners();
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    const responder = queue.shift();
    if (!responder) {
      throw new Error(`unexpected request ${req.method} ${req.url}`);
    }
    return responder(req);
  }) as typeof fetch;
});

beforeEach(async () => {
  calls.length = 0;
  queue = [];
  await sessionService.clear();
  await storage.clear();
});

const user = { id: '1', name: 'Vin', email: 'vin@example.com' };
const profile = { ...user, createdAt: '2026-01-01' };
const flush = () => new Promise<void>(r => setTimeout(() => r(), 0));
const settle = () => new Promise<void>(r => setTimeout(() => r(), 600));

/* ------------------------------ validation ------------------------------ */

describe('validation', () => {
  it('login: requires email and password, checks email shape', () => {
    expect(validate({ email: '', password: '' }, loginSchema)).toEqual({
      email: 'Enter your email',
      password: 'Enter your password',
    });
    expect(validate({ email: 'nope', password: 'x' }, loginSchema)).toEqual({
      email: 'Enter a valid email address',
    });
    expect(validate({ email: 'a@b.co', password: 'x' }, loginSchema)).toEqual(
      {},
    );
  });

  it('register: enforces password strength and confirmation', () => {
    const base = { name: 'Vin', email: 'a@b.co' };
    expect(
      validate(
        { ...base, password: 'short', confirmPassword: 'short' },
        registerSchema,
      ),
    ).toMatchObject({ password: expect.stringMatching(/8 characters/) });
    expect(
      validate(
        { ...base, password: 'onlyletters', confirmPassword: 'onlyletters' },
        registerSchema,
      ),
    ).toMatchObject({ password: expect.any(String) });
    expect(
      validate(
        { ...base, password: 'abc12345', confirmPassword: 'abc12346' },
        registerSchema,
      ),
    ).toEqual({ confirmPassword: 'Passwords do not match' });
    expect(
      validate(
        { ...base, password: 'abc12345', confirmPassword: 'abc12345' },
        registerSchema,
      ),
    ).toEqual({});
    expect(
      validate(
        {
          ...base,
          name: 'V',
          password: 'abc12345',
          confirmPassword: 'abc12345',
        },
        registerSchema,
      ),
    ).toEqual({
      name: 'Name is too short',
    });
  });
});

/* --------------------------- error classification ------------------------ */

describe('classifyAuthError', () => {
  it('maps the cases the screens handle', () => {
    expect(
      classifyAuthError({ status: 401, message: 'x' }, 'login'),
    ).toMatchObject({
      kind: 'invalid-credentials',
      retryable: false,
    });
    expect(
      classifyAuthError({ status: 'NETWORK', message: 'x' }),
    ).toMatchObject({
      kind: 'network',
      retryable: true,
    });
    expect(
      classifyAuthError({ status: 409, message: 'x' }, 'register'),
    ).toMatchObject({
      kind: 'email-taken',
      fieldErrors: { email: expect.any(String) },
    });
    expect(classifyAuthError({ status: 503, message: 'x' })).toMatchObject({
      kind: 'server',
      retryable: true,
    });
    expect(
      classifyAuthError(
        {
          status: 422,
          message: 'x',
          details: {
            detail: [{ loc: ['body', 'username'], msg: 'bad email' }],
          },
        },
        'register',
      ),
    ).toMatchObject({
      kind: 'validation',
      fieldErrors: { email: 'bad email' },
    });
  });
});

/* ------------------------------ launch flow ------------------------------ */

describe('initializeSession (app launch)', () => {
  it('no stored token -> unauthenticated without a network call', async () => {
    const store = setupStore();
    expect(store.getState().auth.initializing).toBe(true);

    await store.dispatch(initializeSession());

    expect(calls).toHaveLength(0);
    expect(store.getState().auth).toMatchObject({
      initializing: false,
      isAuthenticated: false,
      signOutReason: null,
    });
  });

  it('valid token -> validated against /users/me -> authenticated', async () => {
    await secureStorage.saveTokens({ accessToken: 'a1', refreshToken: 'r1' });
    queue = [() => json(profile)];
    const store = setupStore();

    await store.dispatch(initializeSession());

    expect(calls[0].headers.get('Authorization')).toBe('Bearer a1');
    expect(store.getState().auth).toMatchObject({
      initializing: false,
      isAuthenticated: true,
      user,
    });
    expect(sessionService.getAccessToken()).toBe('a1');
    await settle();
  });

  it('expired token -> refreshed -> retried -> authenticated', async () => {
    await secureStorage.saveTokens({
      accessToken: 'stale',
      refreshToken: 'r1',
    });
    queue = [
      () => json({ detail: 'expired' }, 401),
      () => json({ accessToken: 'fresh', refreshToken: 'r2' }),
      () => json(profile),
    ];
    const store = setupStore();

    await store.dispatch(initializeSession());

    expect(calls.map(c => new URL(c.url).pathname)).toEqual([
      '/api/v1/users/me',
      '/api/v1/auth/refresh',
      '/api/v1/users/me',
    ]);
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(sessionService.getAccessToken()).toBe('fresh');
    expect(await secureStorage.getRefreshToken()).toBe('r2');
    await settle();
  });

  it('expired token and rejected refresh -> unauthenticated, tokens wiped', async () => {
    await secureStorage.saveTokens({
      accessToken: 'stale',
      refreshToken: 'dead',
    });
    queue = [
      () => json({ detail: 'expired' }, 401),
      () => json({ detail: 'refresh rejected' }, 401),
    ];
    const store = setupStore();

    await store.dispatch(initializeSession());
    await flush();

    expect(store.getState().auth).toMatchObject({
      initializing: false,
      isAuthenticated: false,
      signOutReason: 'expired',
    });
    expect(sessionService.getAccessToken()).toBeNull();
    expect(await secureStorage.getAccessToken()).toBeNull();
    expect(await secureStorage.getRefreshToken()).toBeNull();
    await settle();
  });

  it('offline with a cached profile -> signed in unverified', async () => {
    await secureStorage.saveTokens({ accessToken: 'a1', refreshToken: 'r1' });
    await sessionService.cacheUser(user);
    // Query retries transient failures: fail every attempt.
    queue = [networkDown, networkDown, networkDown];
    const store = setupStore();

    await store.dispatch(initializeSession());

    expect(store.getState().auth).toMatchObject({
      initializing: false,
      isAuthenticated: true,
      user,
    });
    expect(sessionService.getAccessToken()).toBe('a1');
    await settle();
  }, 15_000);
});

/* --------------------------- expired mid-session ------------------------- */

describe('expired access token during use', () => {
  it('sessionExpired signs the user out with a reason the login screen can show', async () => {
    const store = setupStore();
    store.dispatch(sessionStarted({ token: 'a', refreshToken: 'r', user }));
    await flush();

    store.dispatch(sessionExpired());
    await flush();

    expect(store.getState().auth).toMatchObject({
      isAuthenticated: false,
      user: null,
      signOutReason: 'expired',
    });
    expect(sessionService.getAccessToken()).toBeNull();
    expect(calls).toHaveLength(0); // no revoke call for an expiry
  });
});

/* ------------------------------- login form ------------------------------ */

function renderHook<T>(store: AppStore, hook: () => T) {
  const result: { current: T } = { current: undefined as T };
  function Probe() {
    result.current = hook();
    return null;
  }
  act(() => {
    ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>
          <Probe />
        </ThemeProvider>
      </Provider>,
    );
  });
  return result;
}

describe('useLoginForm', () => {
  it('blocks submit on invalid input without calling the API', async () => {
    const store = setupStore();
    const form = renderHook(store, useLoginForm);

    await act(async () => {
      form.current.setFieldValue('email', 'not-an-email');
    });
    await act(async () => {
      await form.current.handleSubmit();
    });

    expect(calls).toHaveLength(0);
    expect(form.current.field('email').errorText).toBe(
      'Enter a valid email address',
    );
    expect(form.current.field('password').errorText).toBe(
      'Enter your password',
    );
    expect(form.current.isSubmitting).toBe(false);
  });

  it('invalid credentials -> banner, not retryable, stays signed out', async () => {
    const store = setupStore();
    const form = renderHook(store, useLoginForm);
    queue = [() => json({ detail: 'Invalid credentials' }, 401)];

    await act(async () => {
      form.current.setFieldValue('email', 'Vin@Example.com ');
      form.current.setFieldValue('password', 'wrong');
    });
    await act(async () => {
      await form.current.handleSubmit();
    });

    expect(await calls[0].json()).toEqual({
      email: 'vin@example.com',
      password: 'wrong',
    });
    expect(form.current.failure).toMatchObject({
      kind: 'invalid-credentials',
      message: 'Incorrect email or password.',
      retryable: false,
    });
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it('network failure -> retryable banner; retry succeeds and signs in', async () => {
    const store = setupStore();
    const form = renderHook(store, useLoginForm);
    queue = [
      networkDown,
      () => json({ user, accessToken: 'a1', refreshToken: 'r1' }),
    ];

    await act(async () => {
      form.current.setFieldValue('email', 'vin@example.com');
      form.current.setFieldValue('password', 'abc12345');
    });
    await act(async () => {
      await form.current.handleSubmit();
    });
    expect(form.current.failure).toMatchObject({
      kind: 'network',
      retryable: true,
    });

    await act(async () => {
      await form.current.handleSubmit();
    });
    await flush();

    expect(form.current.failure).toBeNull();
    expect(store.getState().auth).toMatchObject({
      isAuthenticated: true,
      user,
    });
    expect(sessionService.getAccessToken()).toBe('a1');
    expect(await secureStorage.getRefreshToken()).toBe('r1');
  });

  it('exposes loading state while the request is in flight', async () => {
    const store = setupStore();
    const form = renderHook(store, useLoginForm);
    let release!: (r: Response) => void;
    queue = [() => new Promise<Response>(r => (release = r))];

    await act(async () => {
      form.current.setFieldValue('email', 'vin@example.com');
      form.current.setFieldValue('password', 'abc12345');
    });
    let submit!: Promise<void>;
    await act(async () => {
      submit = form.current.handleSubmit();
      await flush();
    });
    expect(form.current.isSubmitting).toBe(true);
    expect(form.current.field('email').editable).toBe(false);

    await act(async () => {
      release(json({ user, accessToken: 'a1', refreshToken: 'r1' }));
      await submit;
    });
    expect(form.current.isSubmitting).toBe(false);
  });
});
