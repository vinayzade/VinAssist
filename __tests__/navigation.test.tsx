import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '@/app/App';
import { logout, sessionStarted } from '@/features/auth';
import { getCurrentRouteName } from '@/navigation';
import { store } from '@/store';

const session = {
  token: 'abc',
  user: { id: '1', name: 'Vin', email: 'vin@example.com' },
};

const flush = () =>
  act(() => new Promise<void>(resolve => setTimeout(() => resolve(), 0)));

function hasText(tree: ReactTestRenderer.ReactTestRenderer, text: string) {
  return tree.root
    .findAllByType('Text' as never)
    .some(node => String(node.props.children).includes(text));
}

describe('navigation flow', () => {
  afterAll(() => {
    store.dispatch(logout());
  });

  it('walks Splash -> Auth -> Main -> Auth', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(<App />);
    });

    // Splash is shown while persisted state is restored.
    expect(
      tree.root.findAllByProps({ testID: 'splash-screen' }).length,
    ).toBeGreaterThan(0);

    // Bootstrap finishes with no stored session -> Auth navigator, Login first.
    await flush();
    await flush();
    expect(getCurrentRouteName()).toBe('Login');
    expect(hasText(tree, 'Welcome back')).toBe(true);

    // Signing in swaps to the Main navigator on the Home tab.
    await act(async () => {
      store.dispatch(sessionStarted(session));
    });
    await flush();
    expect(getCurrentRouteName()).toBe('Home');
    expect(hasText(tree, 'Vin')).toBe(true);

    // Signing out returns to Auth.
    await act(async () => {
      store.dispatch(logout());
    });
    await flush();
    expect(getCurrentRouteName()).toBe('Login');

    await act(async () => {
      tree.unmount();
    });
  });
});
