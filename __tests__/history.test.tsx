import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { sessionStarted } from '@/features/auth';
import { HistoryScreen } from '@/features/history';
import { formatRelativeTime } from '@/features/history/activityMeta';
import type { ActivityItem } from '@/services/api';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

// No navigator in these tests: treat "focus" as mount.
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = require('react');
  return { ...actual, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});

/* ------------------------------ fetch mock ------------------------------ */

const calls: Request[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function item(n: number, overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: `h${n}`,
    kind: 'ocr',
    title: `Receipt ${n}`,
    preview: `Coffee ${n}.50`,
    favourite: false,
    refId: `r${n}`,
    lastActivityAt: '2026-09-12T10:00:00Z',
    createdAt: '2026-09-12T10:00:00Z',
    ...overrides,
  };
}

/** In-memory server: 25 items, newest first, honouring page/q/kind/favourite. */
let server: ActivityItem[];
function serve(req: Request): Response {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/v1/history/')) {
    const id = url.pathname.split('/').pop()!;
    const target = server.find(i => i.id === id);
    if (!target) {
      return json({ detail: 'nope', code: 'ACTIVITY_NOT_FOUND' }, 404);
    }
    if (req.method === 'DELETE') {
      server = server.filter(i => i.id !== id);
      return new Response(null, { status: 204 });
    }
    return json(target);
  }
  if (req.method === 'DELETE') {
    server = [];
    return new Response(null, { status: 204 });
  }
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
  const q = url.searchParams.get('q')?.toLowerCase();
  const kinds = url.searchParams.get('kind')?.split(',');
  const favourite = url.searchParams.get('favourite') === 'true';
  let rows = server;
  if (q) {
    rows = rows.filter(i => i.title.toLowerCase().includes(q) || i.preview.toLowerCase().includes(q));
  }
  if (kinds) {
    rows = rows.filter(i => kinds.includes(i.kind));
  }
  if (favourite) {
    rows = rows.filter(i => i.favourite);
  }
  const items = rows.slice((page - 1) * pageSize, page * pageSize);
  return json({ items, page, pageSize, total: rows.length, hasMore: page * pageSize < rows.length });
}

let patchBodies: Array<{ id: string; body: Record<string, unknown> }> = [];

beforeAll(() => {
  registerAppListeners();
  globalThis.fetch = jest.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push(req);
    if (req.method === 'PATCH') {
      const id = new URL(req.url).pathname.split('/').pop()!;
      const body = (await req.clone().json()) as Record<string, unknown>;
      patchBodies.push({ id, body });
      server = server.map(i => (i.id === id ? { ...i, ...body } : i));
      return json(server.find(i => i.id === id));
    }
    return serve(req);
  }) as typeof fetch;
  jest.spyOn(Alert, 'alert');
});
beforeEach(() => {
  calls.length = 0;
  patchBodies = [];
  server = Array.from({ length: 25 }, (_, i) =>
    item(25 - i, {
      kind: (25 - i) % 5 === 0 ? 'conversation' : (25 - i) % 3 === 0 ? 'sentiment' : 'ocr',
      favourite: (25 - i) % 7 === 0,
    }),
  );
  (Alert.alert as jest.Mock).mockClear();
});

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) {
    act(() => tree.unmount());
  }
});

function render() {
  const store = setupStore();
  store.dispatch(sessionStarted({ token: 't', refreshToken: 'r', user: { id: '1', name: 'V', email: 'v@e.com' } }));
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={store}>
        <ThemeProvider theme={lightTheme}>
          <HistoryScreen navigation={navigation as never} route={{ key: 'k', name: 'History' } as never} />
        </ThemeProvider>
      </Provider>,
    );
  });
  mounted.push(tree);
  return { tree, navigation };
}
const host = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.find(n => typeof n.type === 'string' && n.props.testID === id);
const has = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === id).length > 0;
/** Text of a node, or '' while it is not mounted (the count hides during a fetch). */
const textOf = (tree: ReactTestRenderer.ReactTestRenderer, id: string) => {
  if (!has(tree, id)) {
    return '';
  }
  const c = host(tree, id).props.children;
  return Array.isArray(c) ? c.join('') : String(c);
};
const press = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  act(async () => host(tree, id).props.onClick());
const listedIds = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root
    .findAll(n => typeof n.type === 'string' && /^history-item-h\d+$/.test(String(n.props.testID)))
    .map(n => String(n.props.testID).replace('history-item-', ''));
const listUrls = () => calls.filter(c => c.method === 'GET').map(c => decodeURIComponent(new URL(c.url).search));
async function waitFor(pred: () => boolean, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timeout');
    }
    await act(() => new Promise<void>(r => setTimeout(r, 20)));
  }
}

describe('HistoryScreen', () => {
  it('loads one page at a time and appends the next page on demand', async () => {
    const { tree } = render();
    expect(has(tree, 'history-loading')).toBe(true);
    await waitFor(() => has(tree, 'history-count'));

    expect(listUrls()).toEqual(['?page=1&pageSize=20']);
    expect(listedIds(tree)).toHaveLength(20);
    expect(listedIds(tree)[0]).toBe('h25'); // newest first, as served
    expect(textOf(tree, 'history-count')).toBe('Showing 20 of 25');
    expect(has(tree, 'history-load-more')).toBe(true);

    await press(tree, 'history-load-more');
    // The test renderer never lays out, so it keeps the initial window; the
    // count reflects everything the cache now holds.
    await waitFor(() => textOf(tree, 'history-count') === 'Showing 25 of 25');
    expect(listUrls()).toEqual(['?page=1&pageSize=20', '?page=2&pageSize=20']);
    expect(has(tree, 'history-load-more')).toBe(false); // no more pages
  }, 15000);

  it('searches and filters from page one, sending the parameters to the server', async () => {
    const { tree } = render();
    await waitFor(() => has(tree, 'history-count'));

    act(() => host(tree, 'history-search').props.onChangeText('receipt 2'));
    await waitFor(() => listUrls().some(u => u.includes('q=receipt+2') || u.includes('q=receipt 2')));
    await waitFor(() => textOf(tree, 'history-count').includes('matching'));
    expect(listedIds(tree)).toEqual(['h25', 'h24', 'h23', 'h22', 'h21', 'h20', 'h2']);

    act(() => host(tree, 'history-search').props.onChangeText(''));
    await press(tree, 'history-kind-conversation');
    await waitFor(() => listUrls().some(u => u.includes('kind=conversation')));
    await waitFor(() => listedIds(tree).length === 5);
    expect(listedIds(tree)).toEqual(['h25', 'h20', 'h15', 'h10', 'h5']);

    await press(tree, 'history-favourites');
    await waitFor(() => listUrls().some(u => u.includes('kind=conversation') && u.includes('favourite=true')));
    await waitFor(() => textOf(tree, 'history-count') === 'Nothing here');
    expect(has(tree, 'history-empty')).toBe(true);
  });

  it('toggles favourite, renames and deletes through the API and refreshes the list', async () => {
    const { tree } = render();
    await waitFor(() => has(tree, 'history-count'));

    await press(tree, 'history-star-h25');
    await waitFor(() => patchBodies.length === 1);
    expect(patchBodies[0]).toEqual({ id: 'h25', body: { favourite: true } });
    await waitFor(() => host(tree, 'history-star-h25').props.accessibilityState.selected === true);

    await press(tree, 'history-menu-h24');
    expect(has(tree, 'history-actions')).toBe(true);
    await press(tree, 'history-actions-rename');
    await waitFor(() => has(tree, 'history-rename'));
    act(() => host(tree, 'history-rename-input').props.onChangeText('Lunch receipt'));
    await press(tree, 'history-rename-confirm');
    await waitFor(() => patchBodies.length === 2);
    expect(patchBodies[1]).toEqual({ id: 'h24', body: { title: 'Lunch receipt' } });
    await waitFor(() => textOf(tree, 'history-title-h24') === 'Lunch receipt');

    await press(tree, 'history-menu-h23');
    await press(tree, 'history-actions-delete');
    expect(Alert.alert).toHaveBeenCalledWith('Delete this item?', expect.any(String), expect.any(Array));
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    await act(async () => buttons.find(b => b.text === 'Delete')!.onPress?.());
    await waitFor(() => !listedIds(tree).includes('h23'));
    expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith('/history/h23'))).toBe(true);
    expect(textOf(tree, 'history-count')).toBe('Showing 20 of 24');
  });

  it('opens a conversation entry in the assistant', async () => {
    const { tree, navigation } = render();
    await waitFor(() => has(tree, 'history-count'));
    await press(tree, 'history-item-h25'); // a conversation
    expect(navigation.navigate).toHaveBeenCalledWith('AIAssistant', { resume: 'r25' });
    await press(tree, 'history-item-h24'); // OCR: expands, no navigation
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-12T12:00:00Z');
  it.each([
    ['2026-09-12T11:59:40Z', 'just now'],
    ['2026-09-12T11:45:00Z', '15 min ago'],
    ['2026-09-12T09:00:00Z', '3 h ago'],
    ['2026-09-11T09:00:00Z', 'yesterday'],
    ['2026-09-09T09:00:00Z', '3 days ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });
});
