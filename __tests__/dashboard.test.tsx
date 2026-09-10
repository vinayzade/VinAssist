import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '@/app/App';
import { logout, sessionStarted } from '@/features/auth';
import { addHistoryItem, clearHistory } from '@/features/history';
import { ACTIVITY_KINDS, AI_TOOLS, QUICK_ACTIONS } from '@/features/home';
import { formatRelativeTime } from '@/features/home/utils/formatRelativeTime';
import { getCurrentRouteName, navigationRef } from '@/navigation';
import { store } from '@/store';

const session = {
  token: 'abc',
  refreshToken: 'r',
  user: { id: '1', name: 'Vin Patel', email: 'vin@example.com' },
};

const flush = () =>
  act(() => new Promise<void>(resolve => setTimeout(() => resolve(), 0)));

function host(tree: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.find(
    node => typeof node.type === 'string' && node.props.testID === testID,
  );
}

function hostCount(tree: ReactTestRenderer.ReactTestRenderer, prefix: string) {
  return tree.root.findAll(
    node =>
      typeof node.type === 'string' &&
      typeof node.props.testID === 'string' &&
      node.props.testID.startsWith(prefix),
  ).length;
}

function texts(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAllByType('Text' as never).map(node => {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children);
  });
}

async function press(
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
) {
  await act(async () => {
    host(tree, testID).props.onClick();
  });
  await flush();
}

async function backToHome() {
  await act(async () => {
    navigationRef.goBack();
  });
  await flush();
  expect(getCurrentRouteName()).toBe('Home');
}

describe('AI SmartAssist dashboard', () => {
  let tree: ReactTestRenderer.ReactTestRenderer;

  beforeAll(async () => {
    // Fetch must never be hit: the dashboard does no AI processing.
    globalThis.fetch = jest.fn(() => {
      throw new Error('unexpected network call');
    }) as unknown as typeof fetch;

    await act(async () => {
      tree = ReactTestRenderer.create(<App />);
    });
    await flush();
    await flush();
    await act(async () => {
      store.dispatch(sessionStarted(session));
    });
    await flush();
    expect(getCurrentRouteName()).toBe('Home');
  });

  afterAll(async () => {
    store.dispatch(clearHistory());
    store.dispatch(logout());
    await flush();
    await act(async () => tree.unmount());
  });

  it('greets the user by first name with the AI prompt', () => {
    const all = texts(tree);
    expect(all.some(t => t.includes('Hello, Vin'))).toBe(true);
    expect(all).toContain('What would you like AI to help with?');
  });

  it('renders four quick actions and four AI tools', () => {
    expect(QUICK_ACTIONS.map(a => a.title)).toEqual([
      'Scan Document',
      'Analyze Image',
      'Ask AI',
      'Voice Assistant',
    ]);
    expect(AI_TOOLS.map(t => t.title)).toEqual([
      'Smart OCR',
      'Document Summary',
      'Image Quality',
      'Sentiment Analysis',
    ]);
    expect(hostCount(tree, 'quick-action-')).toBe(4);
    expect(hostCount(tree, 'tool-')).toBe(4);
  });

  it('shows an empty state for recent activity', () => {
    expect(hostCount(tree, 'activity-')).toBe(0);
    expect(texts(tree)).toContain('No activity yet');
  });

  it.each([...QUICK_ACTIONS, ...AI_TOOLS].map(a => [a.title, a] as const))(
    'navigates from "%s" to its placeholder screen',
    async (_title, action) => {
      const testID = QUICK_ACTIONS.includes(action)
        ? `quick-action-${action.id}`
        : `tool-${action.id}`;
      await press(tree, testID);
      expect(getCurrentRouteName()).toBe(action.route);
      await backToHome();
    },
  );

  it('lists recent activity newest first, capped, and links to History', async () => {
    await act(async () => {
      for (let i = 1; i <= 7; i += 1) {
        store.dispatch(
          addHistoryItem({
            kind: i % 2 ? 'ocr' : 'sentiment',
            title: `Item ${i}`,
            summary: 'summary',
          }),
        );
      }
    });
    await flush();

    expect(hostCount(tree, 'activity-')).toBe(5);
    const all = texts(tree);
    expect(all).toContain('Item 7');
    expect(all).not.toContain('Item 1');
    expect(all).toContain(ACTIVITY_KINDS.ocr.label);

    const first = tree.root.findAll(
      n =>
        typeof n.type === 'string' &&
        String(n.props.testID).startsWith('activity-'),
    )[0];
    await act(async () => {
      first.props.onClick();
    });
    await flush();
    expect(getCurrentRouteName()).toBe(ACTIVITY_KINDS.ocr.route);
    await backToHome();

    await press(tree, 'see-all-activity');
    expect(getCurrentRouteName()).toBe('History');
    await backToHome();
  });
});

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-09T12:00:00Z');
  it.each([
    ['2026-09-09T11:59:40Z', 'just now'],
    ['2026-09-09T11:45:00Z', '15m ago'],
    ['2026-09-09T09:00:00Z', '3h ago'],
    ['2026-09-07T12:00:00Z', '2d ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });
  it('falls back to a date beyond a week and tolerates bad input', () => {
    expect(formatRelativeTime('2026-08-01T00:00:00Z', now)).toMatch(/Aug/);
    expect(formatRelativeTime('garbage', now)).toBe('');
  });
});
