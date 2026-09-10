export const APP_NAME = 'VinAssist';

/**
 * AsyncStorage keys for non-sensitive data only. Auth tokens live in
 * Keychain / Keystore via `secureStorage` and have no key here.
 */
export const STORAGE_KEYS = {
  USER: '@vinassist/user',
  SETTINGS: '@vinassist/settings',
} as const;
