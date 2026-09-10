import { STORAGE_KEYS } from '@/constants';
import { secureStorage, storage } from '@/services/storage';
import type { AuthSession, User } from '../types';

/**
 * Owns the credentials for the current session.
 *
 * The access token is kept in memory (for synchronous header building) and
 * mirrored to Keychain / Keystore. It is deliberately NOT in Redux: Redux
 * state is serialisable, inspectable in devtools, and easy to log by
 * accident. Redux only ever learns *whether* a session exists.
 *
 * The user profile is not a secret and is cached in AsyncStorage so the app
 * can render the signed-in shell before the network confirms the session.
 */

let accessToken: string | null = null;

export const sessionService = {
  /** Synchronous read for `prepareHeaders`. */
  getAccessToken(): string | null {
    return accessToken;
  },

  hasSession(): boolean {
    return accessToken !== null;
  },

  /**
   * Loads whatever survived the last run. Returns the cached user only when a
   * token exists too; half a session is treated as no session.
   */
  async restore(): Promise<{ token: string; user: User | null } | null> {
    const [token, user] = await Promise.all([
      secureStorage.getAccessToken(),
      storage.getItem<User>(STORAGE_KEYS.USER),
    ]);
    if (!token) {
      accessToken = null;
      await sessionService.clear();
      return null;
    }
    accessToken = token;
    return { token, user };
  },

  /** Persists a full session produced by login / register. */
  async start(session: AuthSession): Promise<void> {
    accessToken = session.token;
    await Promise.all([
      secureStorage.saveTokens({
        accessToken: session.token,
        refreshToken: session.refreshToken,
      }),
      storage.setItem(STORAGE_KEYS.USER, session.user),
    ]);
  },

  /** Called by the refresh flow with a new access (and maybe refresh) token. */
  async rotate(tokens: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<void> {
    accessToken = tokens.accessToken;
    await secureStorage.saveAccessToken(tokens.accessToken);
    if (tokens.refreshToken) {
      await secureStorage.saveRefreshToken(tokens.refreshToken);
    }
  },

  async cacheUser(user: User): Promise<void> {
    await storage.setItem(STORAGE_KEYS.USER, user);
  },

  getRefreshToken(): Promise<string | null> {
    return secureStorage.getRefreshToken();
  },

  /** Forgets everything, in memory and on disk. Safe to call repeatedly. */
  async clear(): Promise<void> {
    accessToken = null;
    await Promise.all([
      secureStorage.clearTokens(),
      storage.removeItem(STORAGE_KEYS.USER),
    ]);
  },
};
