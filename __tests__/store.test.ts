import { logout, sessionService, sessionStarted } from '@/features/auth';
import { restoreSettings, setThemeMode } from '@/features/settings';
import { baseApi } from '@/services/api/baseApi';
import { setupStore } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { secureStorage, storage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';

const session = {
  token: 'abc',
  user: { id: '1', name: 'Vin', email: 'vin@example.com' },
};

beforeAll(() => registerAppListeners());
beforeEach(async () => {
  await sessionService.clear();
  await storage.clear();
});
// Let RTK's autoBatch enhancer (rAF-based) and listener effects settle.
afterEach(() => flush());

describe('store', () => {
  it('registers auth, settings and the RTK Query reducer', () => {
    const state = setupStore().getState();
    expect(state.auth).toEqual({
      isAuthenticated: false,
      user: null,
      initializing: true,
      signOutReason: null,
    });
    expect(state.settings.themeMode).toBe('system');
    expect(state[baseApi.reducerPath]).toBeDefined();
  });

  it('can be preloaded for tests', () => {
    const store = setupStore({
      settings: { ...setupStore().getState().settings, themeMode: 'dark' },
    });
    expect(store.getState().settings.themeMode).toBe('dark');
  });
});

describe('authSlice', () => {
  it('persists credentials and clears them on logout', async () => {
    const store = setupStore();
    store.dispatch(sessionStarted(session));
    await flush();
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(sessionService.getAccessToken()).toBe('abc');
    expect(await secureStorage.getAccessToken()).toBe('abc');
    expect(await storage.getItem(STORAGE_KEYS.USER)).toEqual(session.user);

    store.dispatch(logout());
    await flush();
    expect(store.getState().auth).toMatchObject({
      isAuthenticated: false,
      user: null,
      signOutReason: 'user',
    });
    expect(sessionService.getAccessToken()).toBeNull();
    expect(await secureStorage.getAccessToken()).toBeNull();
    expect(await storage.getItem(STORAGE_KEYS.USER)).toBeNull();
  });
});

describe('settingsSlice', () => {
  it('persists changes only after hydration and restores them', async () => {
    const store = setupStore();
    store.dispatch(setThemeMode('dark'));
    await flush();
    expect(await storage.getItem(STORAGE_KEYS.SETTINGS)).toBeNull();

    await store.dispatch(restoreSettings());
    store.dispatch(setThemeMode('light'));
    await flush();
    expect(await storage.getItem(STORAGE_KEYS.SETTINGS)).toMatchObject({
      themeMode: 'light',
    });

    const fresh = setupStore();
    await fresh.dispatch(restoreSettings());
    expect(fresh.getState().settings).toMatchObject({
      themeMode: 'light',
      hydrated: true,
    });
  });
});

function flush() {
  return new Promise<void>(resolve => setTimeout(() => resolve(), 0));
}
