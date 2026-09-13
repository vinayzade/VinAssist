/**
 * A tiny in-process API for tests: route handlers keyed by method and path,
 * a record of every request, and JSON helpers. Installed as `globalThis.fetch`.
 *
 *   const api = installFetchMock();
 *   api.on('POST', '/api/v1/auth/login', () => api.json({ ... }));
 *   ...
 *   expect(api.calls('POST', '/api/v1/auth/login')).toHaveLength(1);
 */

export type Handler = (req: Request, url: URL) => Response | Promise<Response>;

export interface RecordedCall {
  method: string;
  path: string;
  search: string;
  url: string;
  headers: Headers;
  /** Parsed JSON body when the request had one. */
  body: unknown;
  request: Request;
}

export interface FetchMock {
  /** Register a handler; a path may be a string or a RegExp. Later wins. */
  on: (method: string, path: string | RegExp, handler: Handler) => void;
  /** Everything recorded so far, optionally filtered. */
  calls: (method?: string, path?: string | RegExp) => RecordedCall[];
  reset: () => void;
  json: (body: unknown, status?: number) => Response;
  noContent: () => Response;
  /** Simulates a transport failure (no response at all). */
  networkError: () => never;
}

interface Route {
  method: string;
  path: string | RegExp;
  handler: Handler;
}

function matches(route: Route, method: string, path: string): boolean {
  if (route.method !== '*' && route.method !== method) {
    return false;
  }
  return typeof route.path === 'string' ? route.path === path : route.path.test(path);
}

export function installFetchMock(): FetchMock {
  const routes: Route[] = [];
  const recorded: RecordedCall[] = [];

  const api: FetchMock = {
    on(method, path, handler) {
      routes.unshift({ method: method.toUpperCase(), path, handler });
    },
    calls(method, path) {
      return recorded.filter(
        c =>
          (!method || c.method === method.toUpperCase()) &&
          (!path || (typeof path === 'string' ? c.path === path : path.test(c.path))),
      );
    },
    reset() {
      routes.length = 0;
      recorded.length = 0;
    },
    json(body, status = 200) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    noContent() {
      return new Response(null, { status: 204 });
    },
    networkError() {
      throw new TypeError('Network request failed');
    },
  };

  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    let body: unknown;
    const type = request.headers.get('Content-Type') ?? '';
    if (type.includes('application/json')) {
      try {
        body = await request.clone().json();
      } catch {
        body = undefined;
      }
    }
    recorded.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      url: request.url,
      headers: request.headers,
      body,
      request,
    });
    const route = routes.find(r => matches(r, request.method, url.pathname));
    if (!route) {
      return api.json({ detail: `No handler for ${request.method} ${url.pathname}`, code: 'TEST_UNHANDLED' }, 500);
    }
    return route.handler(request, url);
  }) as typeof fetch;

  return api;
}

/** Bodies the backend returns, in the shapes the app expects. */
export const fixtures = {
  user: { id: 'u1', name: 'Vinay Zade', email: 'vinay@example.com', createdAt: '2026-09-01T00:00:00Z' },
  authResponse(overrides: Partial<{ accessToken: string; refreshToken: string }> = {}) {
    return {
      user: fixtures.user,
      accessToken: overrides.accessToken ?? 'access-1',
      refreshToken: overrides.refreshToken ?? 'refresh-1',
    };
  },
  error(detail: string, code: string) {
    return { detail, code };
  },
  page<T>(items: T[], page = 1, pageSize = 20, total = items.length) {
    return { items, page, pageSize, total, hasMore: page * pageSize < total };
  },
};
