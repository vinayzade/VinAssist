import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { secureStorage, storage } from '@/services/storage';

type KeychainMock = typeof Keychain & {
  __store: Map<string, { password: string; options: Keychain.SetOptions }>;
  __reset: () => void;
};
const keychain = Keychain as KeychainMock;

beforeEach(() => {
  keychain.__reset();
  jest.clearAllMocks();
});

describe('secureStorage', () => {
  it('round-trips access and refresh tokens independently', async () => {
    await secureStorage.saveAccessToken('access-1');
    await secureStorage.saveRefreshToken('refresh-1');

    expect(await secureStorage.getAccessToken()).toBe('access-1');
    expect(await secureStorage.getRefreshToken()).toBe('refresh-1');

    await secureStorage.saveAccessToken('access-2');
    expect(await secureStorage.getAccessToken()).toBe('access-2');
    expect(await secureStorage.getRefreshToken()).toBe('refresh-1');
  });

  it('returns null when nothing is stored', async () => {
    expect(await secureStorage.getAccessToken()).toBeNull();
    expect(await secureStorage.getRefreshToken()).toBeNull();
  });

  it('clearTokens removes both and is idempotent', async () => {
    await secureStorage.saveTokens({ accessToken: 'a', refreshToken: 'r' });
    await secureStorage.clearTokens();
    await secureStorage.clearTokens();
    expect(await secureStorage.getAccessToken()).toBeNull();
    expect(await secureStorage.getRefreshToken()).toBeNull();
  });

  it('saveTokens without a refresh token drops any stale one', async () => {
    await secureStorage.saveRefreshToken('old');
    await secureStorage.saveTokens({ accessToken: 'a' });
    expect(await secureStorage.getRefreshToken()).toBeNull();
  });

  it('refuses to save an empty token', async () => {
    await expect(secureStorage.saveAccessToken('')).rejects.toThrow(/empty/);
  });

  it('uses Keystore AES-GCM and device-only Keychain accessibility', async () => {
    await secureStorage.saveAccessToken('a');
    const [, , options] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0] as [string, string, Keychain.SetOptions];
    expect(options).toMatchObject({
      service: 'com.vinassist.auth.accessToken',
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      cloudSync: false,
    });
  });

  it('treats a keychain read failure as signed out', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(
      new Error('keystore unavailable'),
    );
    expect(await secureStorage.getAccessToken()).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never touches AsyncStorage', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    await secureStorage.saveTokens({ accessToken: 'a', refreshToken: 'r' });
    await secureStorage.getAccessToken();
    expect(setItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
    setItem.mockRestore();
  });
});

describe('storage (AsyncStorage) guard', () => {
  it('rejects keys that look like credentials', async () => {
    await expect(storage.setItem('@app/auth_token', 'x')).rejects.toThrow(
      /secureStorage/,
    );
    await expect(storage.setItem('@app/refreshToken', 'x')).rejects.toThrow();
    await expect(storage.setItem('@app/password', 'x')).rejects.toThrow();
    await expect(
      storage.setItem('@app/settings', { a: 1 }),
    ).resolves.toBeUndefined();
  });
});
