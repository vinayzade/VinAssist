import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import * as DocumentPicker from '@react-native-documents/picker';
import { sessionStarted } from '@/features/auth';
import { DocumentAnalysisScreen } from '@/features/documentAnalysis';
import { documentApi } from '@/services/api';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

/* ------------------------------ fetch mock ------------------------------ */

const calls: Request[] = [];
let responder: (req: Request) => Response = () => json({ detail: 'unexpected' }, 500);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UPLOADED = {
  id: 'doc-1',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  kind: 'pdf',
  status: 'uploaded',
  sha256: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  createdAt: '2026-09-11T00:00:00Z',
};

beforeAll(() => {
  // Auth listeners mirror the session token into the API layer.
  registerAppListeners();
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    return responder(req);
  }) as typeof fetch;
});

beforeEach(() => {
  calls.length = 0;
  responder = () => json(UPLOADED, 201);
});

const session = {
  token: 'access-1',
  refreshToken: 'refresh-1',
  user: { id: '1', name: 'Vin', email: 'vin@example.com' },
};
const flush = () => act(() => new Promise<void>(r => setTimeout(r, 0)));

/* ------------------------------- endpoint -------------------------------- */

describe('documentApi.uploadDocument', () => {
  it('POSTs multipart form data to /documents/upload with the bearer token', async () => {
    const store = setupStore();
    store.dispatch(sessionStarted(session));
    await flush();

    const result = await store.dispatch(
      documentApi.endpoints.uploadDocument.initiate({
        uri: 'file:///report.pdf',
        name: 'report.pdf',
        type: 'application/pdf',
      }),
    );

    expect('data' in result && result.data).toMatchObject({ id: 'doc-1', status: 'uploaded' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/documents/upload');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer access-1');
    expect(calls[0].headers.get('Content-Type')).not.toBe('application/json');
  });

  it('is never retried automatically', async () => {
    responder = () => {
      throw new TypeError('Network request failed');
    };
    const store = setupStore();

    const result = await store.dispatch(
      documentApi.endpoints.uploadDocument.initiate({
        uri: 'file:///a.pdf',
        name: 'a.pdf',
        type: 'application/pdf',
      }),
    );

    expect('error' in result).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

/* --------------------------------- screen -------------------------------- */

const docs = (DocumentPicker as unknown as { __mock: { next: unknown } }).__mock;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render(store = setupStore()) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>
          <DocumentAnalysisScreen
            navigation={{ navigate: jest.fn() } as never}
            route={{ key: 'k', name: 'DocumentAnalysis', params: undefined }}
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

async function pickPdf(tree: ReactTestRenderer.ReactTestRenderer) {
  docs.next = {
    uri: 'content://x/report.pdf',
    name: 'report.pdf',
    size: 2048,
    type: 'application/pdf',
    error: null,
  };
  await act(async () => host(tree, 'document-source-browse').props.onClick());
}

describe('DocumentAnalysisScreen upload', () => {
  it('uploads the selected file and shows the stored record', async () => {
    const store = setupStore();
    store.dispatch(sessionStarted(session));
    const tree = render(store);
    expect(has(tree, 'document-upload')).toBe(false);

    await pickPdf(tree);
    expect(has(tree, 'document-upload')).toBe(true);

    await act(async () => host(tree, 'document-upload').props.onClick());
    await flush();

    expect(calls[0].url).toBe('http://10.0.2.2:8000/api/v1/documents/upload');
    expect(has(tree, 'document-uploaded')).toBe(true);
    expect(textOf(tree, 'document-uploaded-sha')).toContain('abcdef0123456789');
    expect(has(tree, 'document-upload')).toBe(false); // no double upload
  });

  it('explains server-side rejections and offers a retry', async () => {
    responder = () => json({ detail: 'The file is larger than the 20.0 MB limit.', code: 'FILE_TOO_LARGE' }, 413);
    const tree = render();
    await pickPdf(tree);

    await act(async () => host(tree, 'document-upload').props.onClick());
    await flush();

    expect(textOf(tree, 'document-upload-error')).toMatch(/larger than the server allows/);
    expect(has(tree, 'document-uploaded')).toBe(false);
    expect(host(tree, 'document-upload')).toBeTruthy();
  });

  it('surfaces the backend message for content mismatches', async () => {
    responder = () => json({ detail: "The file's contents do not match its type.", code: 'CONTENT_MISMATCH' }, 400);
    const tree = render();
    await pickPdf(tree);

    await act(async () => host(tree, 'document-upload').props.onClick());
    await flush();

    expect(textOf(tree, 'document-upload-error')).toMatch(/contents do not match/);
  });
});
