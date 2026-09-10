import * as Keychain from 'react-native-keychain';
import { logger } from '@/utils/logger';

/**
 * Hardware-backed secret storage for authentication tokens.
 *
 *  - Android: Android Keystore, AES-GCM. The key never leaves the Keystore
 *    (TEE / StrongBox where the device has one); only ciphertext is on disk.
 *  - iOS: Keychain, restricted to this device (no iCloud sync, not included
 *    in unencrypted backups) and readable after the first unlock so
 *    background refreshes keep working.
 *
 * Tokens must never go through AsyncStorage: it is a plain SQLite/file store
 * readable by anyone with a backup or a rooted device.
 */

/** One Keychain/Keystore entry per token so they can be rotated independently. */
const SERVICE = {
  accessToken: 'com.vinassist.auth.accessToken',
  refreshToken: 'com.vinassist.auth.refreshToken',
} as const;

type TokenKind = keyof typeof SERVICE;

/** react-native-keychain requires a username; tokens have none. */
const USERNAME = 'token';

const WRITE_OPTIONS: Keychain.SetOptions = {
  // iOS: available after first unlock, this device only, no iCloud.
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  cloudSync: false,
  // Android: Keystore AES-GCM without a per-read biometric/passcode prompt.
  // Silent access is required because tokens are read on every request.
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  // Use hardware-backed keys when the device has them; do not refuse to run
  // on devices that only offer software Keystore.
  securityLevel: Keychain.SECURITY_LEVEL.ANY,
};

async function save(kind: TokenKind, value: string): Promise<void> {
  if (!value) {
    throw new Error(`[secureStorage] refusing to save an empty ${kind}`);
  }
  const result = await Keychain.setGenericPassword(USERNAME, value, {
    ...WRITE_OPTIONS,
    service: SERVICE[kind],
  });
  if (result === false) {
    throw new Error(`[secureStorage] failed to save ${kind}`);
  }
}

async function read(kind: TokenKind): Promise<string | null> {
  try {
    const result = await Keychain.getGenericPassword({
      service: SERVICE[kind],
    });
    return result ? result.password : null;
  } catch (error) {
    // A corrupt or inaccessible entry should behave like "signed out", not
    // crash the app at startup. The caller will re-authenticate.
    logger.warn(`[secureStorage] could not read ${kind}`, error);
    return null;
  }
}

async function remove(kind: TokenKind): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE[kind] });
}

export function saveAccessToken(token: string): Promise<void> {
  return save('accessToken', token);
}

export function getAccessToken(): Promise<string | null> {
  return read('accessToken');
}

export function saveRefreshToken(token: string): Promise<void> {
  return save('refreshToken', token);
}

export function getRefreshToken(): Promise<string | null> {
  return read('refreshToken');
}

/** Removes both tokens. Safe to call when nothing is stored. */
export async function clearTokens(): Promise<void> {
  await Promise.all([remove('accessToken'), remove('refreshToken')]);
}

/**
 * Convenience for the auth flow: persist a full token pair atomically from
 * the caller's point of view (both succeed or the caller sees an error).
 */
export async function saveTokens(tokens: {
  accessToken: string;
  refreshToken?: string | null;
}): Promise<void> {
  await saveAccessToken(tokens.accessToken);
  if (tokens.refreshToken) {
    await saveRefreshToken(tokens.refreshToken);
  } else {
    await remove('refreshToken');
  }
}

export const secureStorage = {
  saveAccessToken,
  getAccessToken,
  saveRefreshToken,
  getRefreshToken,
  clearTokens,
  saveTokens,
};
