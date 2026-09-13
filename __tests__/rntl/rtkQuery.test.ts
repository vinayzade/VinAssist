/**
 * RTK Query integration against a fake server: caching, tag invalidation,
 * infinite paging, error normalisation, and the auth header. The refresh and
 * retry policies have their own coverage in `api.test.ts`.
 */

import { aiApi, historyApi, documentApi, getApiErrorMessage, getErrorStatus, type ApiError } from '@/services/api';
import { logout } from '@/features/auth';
import { makeStore } from '../../test-utils/render';
import { fixtures, installFetchMock, type FetchMock } from '../../test-utils/fetchMock';

let api: FetchMock;
beforeEach(() => {
  api = installFetchMock();
});

const item = (n: number) => ({
  id: `h${n}`, kind: 'ocr', title: `Item ${n}`, preview: '', favourite: false, refId: null,
  lastActivityAt: '2026-09-12T00:00:00Z', createdAt: '2026-09-12T00:00:00Z',
});

describe('RTK Query integration', () => {
  it('sends the bearer token and caches identical queries', async () => {
    api.on('GET', '/api/v1/history', () => api.json(fixtures.page([item(1)])));
    const store = makeStore();

    const first = await store.dispatch(historyApi.endpoints.listHistory.initiate({}));
    const second = await store.dispatch(historyApi.endpoints.listHistory.initiate({}));

    expect(api.calls('GET', '/api/v1/history')).toHaveLength(1); // served from cache
    expect(api.calls('GET')[0].headers.get('Authorization')).toBe('Bearer access-1');
    expect(first.data).toBe(second.data);
    expect(first.data?.pages[0].items).toHaveLength(1);
  });

  it('infinite query: pages accumulate and stop when hasMore is false', async () => {
    const all = Array.from({ length: 45 }, (_, i) => item(i + 1));
    api.on('GET', '/api/v1/history', (_req, url) => {
      const page = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
      return api.json(fixtures.page(all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, all.length));
    });
    const store = makeStore();
    const arg = { pageSize: 20 };

    await store.dispatch(historyApi.endpoints.listHistory.initiate(arg));
    await store.dispatch(historyApi.endpoints.listHistory.initiate(arg, { direction: 'forward' }));
    await store.dispatch(historyApi.endpoints.listHistory.initiate(arg, { direction: 'forward' }));
    const state = historyApi.endpoints.listHistory.select(arg)(store.getState());

    expect(state.data?.pageParams).toEqual([1, 2, 3]);
    expect(state.data?.pages.flatMap(p => p.items)).toHaveLength(45);
    expect(state.hasNextPage).toBe(false);
    expect(api.calls('GET').map(c => c.search)).toEqual(['?page=1&pageSize=20', '?page=2&pageSize=20', '?page=3&pageSize=20']);
  });

  it('a sentiment analysis invalidates the history list so every loaded page refetches', async () => {
    let served = [item(1)];
    api.on('GET', '/api/v1/history', () => api.json(fixtures.page(served)));
    api.on('POST', '/api/v1/ai/sentiment', () => {
      served = [item(2), item(1)];
      return api.json({
        sentiment: 'POSITIVE', confidence: 0.9, scores: {}, id: 's1', provider: 'mock', model: 'm',
        processingMs: 1, createdAt: '2026-09-12T00:00:00Z',
      });
    });
    const store = makeStore();
    const subscription = store.dispatch(historyApi.endpoints.listHistory.initiate({}));
    await subscription;

    await store.dispatch(aiApi.endpoints.analyzeSentiment.initiate({ text: 'I love it' }));
    // The subscribed query is refetched after invalidation.
    await new Promise<void>(r => setTimeout(() => r(), 50));
    const state = historyApi.endpoints.listHistory.select({})(store.getState());
    expect(api.calls('GET', '/api/v1/history')).toHaveLength(2);
    expect(state.data?.pages[0].items.map(i => i.id)).toEqual(['h2', 'h1']);
    subscription.unsubscribe();
  });

  it('rename patches, then the list and the item cache refresh', async () => {
    let title = 'Item 1';
    api.on('GET', '/api/v1/history', () => api.json(fixtures.page([{ ...item(1), title }])));
    api.on('GET', '/api/v1/history/h1', () => api.json({ ...item(1), title, payload: null }));
    api.on('PATCH', '/api/v1/history/h1', async req => {
      title = ((await req.json()) as { title: string }).title;
      return api.json({ ...item(1), title });
    });
    const store = makeStore();
    const list = store.dispatch(historyApi.endpoints.listHistory.initiate({}));
    const detail = store.dispatch(historyApi.endpoints.getHistoryItem.initiate('h1'));
    await Promise.all([list, detail]);

    await store.dispatch(historyApi.endpoints.updateHistoryItem.initiate({ id: 'h1', title: 'Renamed' }));
    await new Promise<void>(r => setTimeout(() => r(), 50));

    expect(api.calls('PATCH', '/api/v1/history/h1')[0].body).toEqual({ title: 'Renamed' });
    expect(historyApi.endpoints.getHistoryItem.select('h1')(store.getState()).data?.title).toBe('Renamed');
    expect(historyApi.endpoints.listHistory.select({})(store.getState()).data?.pages[0].items[0].title).toBe('Renamed');
    list.unsubscribe();
    detail.unsubscribe();
  });

  it('normalises server errors to {status, code, message} and transport failures to NETWORK', async () => {
    api.on('POST', '/api/v1/ai/summarize', () =>
      api.json(fixtures.error('The AI service is temporarily unavailable.', 'AI_UNAVAILABLE'), 503),
    );
    api.on('POST', '/api/v1/ai/extract', () => api.networkError());
    const store = makeStore();

    const unavailable = await store.dispatch(aiApi.endpoints.summarizeText.initiate({ text: 'some words here' }));
    expect('error' in unavailable && (unavailable.error as ApiError)).toMatchObject({
      status: 503,
      code: 'AI_UNAVAILABLE',
      message: 'The AI service is temporarily unavailable.',
    });
    expect(getErrorStatus(('error' in unavailable && unavailable.error) as never)).toBe(503);

    const offline = await store.dispatch(aiApi.endpoints.extractDocument.initiate({ text: 'some words here' }));
    expect('error' in offline && (offline.error as ApiError).status).toBe('NETWORK');
    expect(getApiErrorMessage(('error' in offline && offline.error) as never)).toMatch(/connection/i);
  });

  it('uploads documents as multipart form data, not JSON', async () => {
    api.on('POST', '/api/v1/documents/upload', () =>
      api.json({ id: 'd1', name: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 1, kind: 'pdf', status: 'uploaded', sha256: null, createdAt: 'x' }, 201),
    );
    const store = makeStore();
    const result = await store.dispatch(
      documentApi.endpoints.uploadDocument.initiate({ uri: 'file:///a.pdf', name: 'a.pdf', type: 'application/pdf' }),
    );
    expect('data' in result && result.data?.id).toBe('d1');
    const [call] = api.calls('POST', '/api/v1/documents/upload');
    expect(call.headers.get('Content-Type') ?? '').not.toContain('application/json');
    expect(call.body).toBeUndefined();
  });

  it('after sign-out no Authorization header is sent', async () => {
    api.on('GET', '/api/v1/history', () => api.json(fixtures.page([])));
    api.on('POST', '/api/v1/auth/logout', () => api.noContent());
    const store = makeStore();
    // The listener mirrors the session into the API layer; logout clears it
    // (asynchronously, after revoking on the server).
    store.dispatch(logout());
    await new Promise<void>(r => setTimeout(() => r(), 20));
    await store.dispatch(historyApi.endpoints.listHistory.initiate({}));
    expect(api.calls('GET')[0].headers.get('Authorization')).toBeNull();
    expect(api.calls('POST', '/api/v1/auth/logout')).toHaveLength(1);
  });
});
