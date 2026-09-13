/**
 * Auth flow through the real app: register, sign in, error banners, session
 * expiry, sign out. Uses React Native Testing Library against `<App />` with
 * the navigation container, so what is asserted is what the user sees.
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Keychain from 'react-native-keychain';
import App from '@/app/App';
import { logout, sessionExpired } from '@/features/auth';
import { getCurrentRouteName } from '@/navigation';
import { store } from '@/store';
import { fixtures, installFetchMock, type FetchMock } from '../../test-utils/fetchMock';

const keychain = Keychain as unknown as { __reset: () => void; __store: Map<string, unknown> };

let api: FetchMock;

beforeEach(() => {
  api = installFetchMock();
  keychain.__reset();
});

afterEach(async () => {
  await act(async () => {
    store.dispatch(logout());
  });
});

async function renderApp() {
  await render(<App />);
  // Splash -> Login once the (empty) keychain has been read.
  await waitFor(() => expect(getCurrentRouteName()).toBe('Login'));
}

async function signInAs(email: string, password: string) {
  await fireEvent.changeText(screen.getByTestId('login-email'), email);
  await fireEvent.changeText(screen.getByTestId('login-password'), password);
  await fireEvent.press(screen.getByTestId('login-submit'));
}

describe('auth flow', () => {
  it('registers a new account and lands on Home with tokens stored securely', async () => {
    api.on('POST', '/api/v1/auth/register', () => api.json(fixtures.authResponse(), 201));
    await renderApp();

    await fireEvent.press(screen.getByText('Register'));
    await waitFor(() => expect(getCurrentRouteName()).toBe('Register'));

    await fireEvent.changeText(screen.getByTestId('register-name'), 'Vinay Zade');
    await fireEvent.changeText(screen.getByTestId('register-email'), 'vinay@example.com');
    await fireEvent.changeText(screen.getByTestId('register-password'), 'Str0ngPassw0rd');
    await fireEvent.changeText(screen.getByTestId('register-confirm'), 'Str0ngPassw0rd');
    await fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() => expect(getCurrentRouteName()).toBe('Home'));
    expect(await screen.findByText(/Hello, Vinay/)).toBeTruthy();

    const [call] = api.calls('POST', '/api/v1/auth/register');
    expect(call.body).toEqual({ name: 'Vinay Zade', email: 'vinay@example.com', password: 'Str0ngPassw0rd' });
    expect(call.headers.get('Authorization')).toBeNull(); // public endpoint
    expect(store.getState().auth).toMatchObject({ isAuthenticated: true, user: { email: 'vinay@example.com' } });
    // Tokens live in the keychain, never in redux state.
    expect(JSON.stringify(store.getState().auth)).not.toContain('access-1');
    expect([...keychain.__store.values()].some(v => JSON.stringify(v).includes('refresh-1'))).toBe(true);
  });

  it('shows field validation before any request is made', async () => {
    await renderApp();
    await signInAs('not-an-email', '');
    expect(await screen.findByText(/valid email/i)).toBeTruthy();
    expect(api.calls('POST')).toHaveLength(0);
    expect(getCurrentRouteName()).toBe('Login');
  });

  it('signs in, then signs out from the profile tab', async () => {
    api.on('POST', '/api/v1/auth/login', () => api.json(fixtures.authResponse()));
    api.on('POST', '/api/v1/auth/logout', () => api.noContent());
    api.on('GET', '/api/v1/history', () => api.json(fixtures.page([])));
    await renderApp();

    await signInAs('vinay@example.com', 'Str0ngPassw0rd');
    await waitFor(() => expect(getCurrentRouteName()).toBe('Home'));
    expect(api.calls('POST', '/api/v1/auth/login')[0].body).toEqual({
      email: 'vinay@example.com',
      password: 'Str0ngPassw0rd',
    });

    await fireEvent.press(screen.getByText('Profile'));
    await waitFor(() => expect(getCurrentRouteName()).toBe('Profile'));
    await fireEvent.press(screen.getByText('Sign out'));

    await waitFor(() => expect(getCurrentRouteName()).toBe('Login'));
    await waitFor(() => expect(api.calls('POST', '/api/v1/auth/logout')).toHaveLength(1));
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(keychain.__store.size).toBe(0);
  });

  it('wrong password: shows the server message, stays signed out, no retry offered', async () => {
    api.on('POST', '/api/v1/auth/login', () =>
      api.json(fixtures.error('Incorrect email or password.', 'INVALID_CREDENTIALS'), 401),
    );
    await renderApp();
    await signInAs('vinay@example.com', 'wrong-pass');

    expect(await screen.findByText('Incorrect email or password.')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
    expect(getCurrentRouteName()).toBe('Login');
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it('network failure: retryable banner, and retrying succeeds', async () => {
    let attempts = 0;
    api.on('POST', '/api/v1/auth/login', () => {
      attempts += 1;
      return attempts === 1 ? api.networkError() : api.json(fixtures.authResponse());
    });
    api.on('GET', '/api/v1/history', () => api.json(fixtures.page([])));
    await renderApp();
    await signInAs('vinay@example.com', 'Str0ngPassw0rd');

    expect(await screen.findByText(/could not reach the server/i)).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(getCurrentRouteName()).toBe('Home'));
    expect(attempts).toBe(2);
  });

  it('an expired session returns to Login with an explanation', async () => {
    api.on('POST', '/api/v1/auth/login', () => api.json(fixtures.authResponse()));
    api.on('GET', '/api/v1/history', () => api.json(fixtures.page([])));
    await renderApp();
    await signInAs('vinay@example.com', 'Str0ngPassw0rd');
    await waitFor(() => expect(getCurrentRouteName()).toBe('Home'));

    await act(async () => {
      store.dispatch(sessionExpired());
    });
    await waitFor(() => expect(getCurrentRouteName()).toBe('Login'));
    expect(screen.getByTestId('session-expired-banner')).toBeTruthy();
    expect(keychain.__store.size).toBe(0);
  });
});
