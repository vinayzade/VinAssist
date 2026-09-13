/**
 * React Native Testing Library helpers with the app's providers.
 *
 *   const { store } = renderWithProviders(<Screen ... />, { signedIn: true });
 *   fireEvent.changeText(screen.getByTestId('login-email'), 'a@b.com');
 */

import React, { type PropsWithChildren, type ReactElement } from 'react';
import { render, renderHook, type RenderOptions } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { sessionStarted } from '@/features/auth';
import { setupStore, type AppStore, type RootState } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider, lightTheme } from '@/theme';

let listenersRegistered = false;

export const testSession = {
  token: 'access-1',
  refreshToken: 'refresh-1',
  user: { id: 'u1', name: 'Vinay Zade', email: 'vinay@example.com' },
};

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
  preloadedState?: Partial<RootState>;
  /** Dispatches a signed-in session before rendering (default true). */
  signedIn?: boolean;
}

export function makeStore(options: Pick<ProviderOptions, 'store' | 'preloadedState' | 'signedIn'> = {}) {
  if (!listenersRegistered) {
    // Mirrors the session token into the API layer; idempotent per process.
    registerAppListeners();
    listenersRegistered = true;
  }
  const store = options.store ?? setupStore(options.preloadedState);
  if (options.signedIn !== false) {
    store.dispatch(sessionStarted(testSession));
  }
  return store;
}

export function Providers({ store, children }: PropsWithChildren<{ store: AppStore }>) {
  return (
    <Provider store={store}>
      <ThemeProvider theme={lightTheme}>{children}</ThemeProvider>
    </Provider>
  );
}

/** RNTL v14: rendering is asynchronous, so this must be awaited. */
export async function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  const { store: given, preloadedState, signedIn, ...renderOptions } = options;
  const store = makeStore({ store: given, preloadedState, signedIn });
  const wrapper = ({ children }: PropsWithChildren) => <Providers store={store}>{children}</Providers>;
  const result = await render(ui, { wrapper, ...renderOptions });
  return { store, ...result };
}

export async function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: ProviderOptions & { initialProps?: Props } = {},
) {
  const { store: given, preloadedState, signedIn, initialProps } = options;
  const store = makeStore({ store: given, preloadedState, signedIn });
  const wrapper = ({ children }: PropsWithChildren) => <Providers store={store}>{children}</Providers>;
  const result = await renderHook(hook, { wrapper, initialProps });
  return { store, ...result };
}

/** Navigation prop stand-in for screens rendered outside a navigator. */
export function fakeNavigation() {
  return {
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
    replace: jest.fn(),
    setOptions: jest.fn(),
  };
}

export function fakeRoute<P>(name: string, params?: P) {
  return { key: `${name}-key`, name, params } as never;
}
