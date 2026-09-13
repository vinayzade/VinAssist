/**
 * Redux reducers as pure functions: given a state and an action, assert the
 * next state. No store, no side effects.
 */

import {
  authReducer,
  initializeSession,
  logout,
  sessionExpired,
  sessionStarted,
  signOutReasonAcknowledged,
} from '@/features/auth';
import {
  initialSettingsState,
  resetSettings,
  restoreSettings,
  setHapticsEnabled,
  setLanguage,
  setThemeMode,
  setVoiceRepliesEnabled,
  settingsReducer,
} from '@/features/settings/store/settingsSlice';

const user = { id: 'u1', name: 'Vinay', email: 'v@example.com' };
const session = { token: 'a', refreshToken: 'r', user };

describe('authReducer', () => {
  const initial = authReducer(undefined, { type: '@@init' });

  it('starts signed out and initialising', () => {
    expect(initial).toEqual({ isAuthenticated: false, user: null, initializing: true, signOutReason: null });
  });

  it('sessionStarted signs in and clears any sign-out reason', () => {
    const expired = authReducer(initial, sessionExpired());
    const next = authReducer(expired, sessionStarted(session));
    expect(next).toMatchObject({ isAuthenticated: true, user, signOutReason: null });
  });

  it('logout signs out with the "user" reason; sessionExpired with "expired"', () => {
    const signedIn = authReducer(initial, sessionStarted(session));
    expect(authReducer(signedIn, logout())).toMatchObject({ isAuthenticated: false, user: null, signOutReason: 'user' });
    expect(authReducer(signedIn, sessionExpired())).toMatchObject({ isAuthenticated: false, user: null, signOutReason: 'expired' });
  });

  it('signOutReasonAcknowledged only clears the reason', () => {
    const expired = authReducer(authReducer(initial, sessionStarted(session)), sessionExpired());
    const next = authReducer(expired, signOutReasonAcknowledged());
    expect(next.signOutReason).toBeNull();
    expect(next.isAuthenticated).toBe(false);
  });

  it('initializeSession: pending -> initialising; fulfilled resolves each launch outcome', () => {
    const pending = authReducer({ ...initial, initializing: false }, initializeSession.pending('req', undefined));
    expect(pending.initializing).toBe(true);

    const authenticated = authReducer(
      pending,
      initializeSession.fulfilled({ status: 'authenticated', user } as never, 'req', undefined),
    );
    expect(authenticated).toMatchObject({ isAuthenticated: true, user, initializing: false });

    const rejected = authReducer(
      pending,
      initializeSession.fulfilled({ status: 'unauthenticated', reason: 'rejected' } as never, 'req', undefined),
    );
    expect(rejected).toMatchObject({ isAuthenticated: false, initializing: false, signOutReason: 'expired' });

    const noSession = authReducer(
      pending,
      initializeSession.fulfilled({ status: 'unauthenticated', reason: 'none' } as never, 'req', undefined),
    );
    expect(noSession).toMatchObject({ isAuthenticated: false, initializing: false, signOutReason: null });

    const failed = authReducer(pending, initializeSession.rejected(new Error('boom'), 'req', undefined));
    expect(failed.initializing).toBe(false);
    expect(failed.isAuthenticated).toBe(false);
  });

  it('never stores tokens in state', () => {
    const next = authReducer(initial, sessionStarted(session));
    expect(JSON.stringify(next)).not.toMatch(/"a"|"r"|token/i);
  });
});

describe('settingsReducer', () => {
  it('has safe defaults and is not hydrated until restore completes', () => {
    expect(settingsReducer(undefined, { type: '@@init' })).toEqual({
      themeMode: 'system',
      language: 'en',
      hapticsEnabled: true,
      voiceRepliesEnabled: true,
      hydrated: false,
    });
  });

  it('setters change exactly one field', () => {
    let state = initialSettingsState;
    state = settingsReducer(state, setThemeMode('dark'));
    state = settingsReducer(state, setLanguage('hi'));
    state = settingsReducer(state, setHapticsEnabled(false));
    state = settingsReducer(state, setVoiceRepliesEnabled(false));
    expect(state).toEqual({ ...initialSettingsState, themeMode: 'dark', language: 'hi', hapticsEnabled: false, voiceRepliesEnabled: false });
  });

  it('restoreSettings merges what was persisted and marks hydration; rejection still hydrates', () => {
    const restored = settingsReducer(
      initialSettingsState,
      restoreSettings.fulfilled({ themeMode: 'light' }, 'req'),
    );
    expect(restored).toMatchObject({ themeMode: 'light', language: 'en', hydrated: true });

    const empty = settingsReducer(initialSettingsState, restoreSettings.fulfilled(null, 'req'));
    expect(empty).toMatchObject({ ...initialSettingsState, hydrated: true });

    const rejected = settingsReducer(initialSettingsState, restoreSettings.rejected(new Error('disk'), 'req'));
    expect(rejected.hydrated).toBe(true);
  });

  it('resetSettings returns defaults but stays hydrated', () => {
    const changed = settingsReducer({ ...initialSettingsState, themeMode: 'dark', hydrated: true }, resetSettings());
    expect(changed).toEqual({ ...initialSettingsState, hydrated: true });
  });
});
