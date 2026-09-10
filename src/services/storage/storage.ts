import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Keys that must never be written here. AsyncStorage is unencrypted; use
 * `secureStorage` (Keychain / Keystore) for credentials.
 */
const SENSITIVE_KEY = /(token|secret|password|credential|api[_-]?key)/i;

function assertNotSensitive(key: string) {
  if (SENSITIVE_KEY.test(key)) {
    throw new Error(
      `[storage] "${key}" looks like a credential. Use secureStorage instead of AsyncStorage.`,
    );
  }
}

/**
 * Plain key/value persistence for NON-sensitive data (preferences, cached
 * profile, UI state). Values are JSON-encoded.
 */
export const storage = {
  async getItem<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    assertNotSensitive(key);
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  },
};
