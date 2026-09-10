import { isAnyOf, type PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/services/api/authApi';
import { baseApi } from '@/services/api/baseApi';
import { startAppListening } from '@/store/listenerMiddleware';
import { sessionService } from '../services/sessionService';
import type { AuthSession } from '../types';
import { sessionExpired } from './authActions';
import { logout, sessionStarted } from './authSlice';

const sessionProduced = isAnyOf(
  sessionStarted,
  authApi.endpoints.login.matchFulfilled,
  authApi.endpoints.register.matchFulfilled,
);

/**
 * Side effects for the auth lifecycle. Keeping them here (instead of in
 * reducers or components) means any code path that produces or ends a
 * session gets persistence and cleanup for free.
 */
export function registerAuthListeners() {
  // A new session: persist tokens (Keychain) and the profile (AsyncStorage).
  startAppListening({
    matcher: sessionProduced,
    effect: async (action: PayloadAction<AuthSession>) => {
      await sessionService.start(action.payload);
    },
  });

  // Session over: revoke, wipe the API cache, forget credentials.
  startAppListening({
    matcher: isAnyOf(logout, sessionExpired),
    effect: async (action, { dispatch, delay }) => {
      // Best-effort server-side revocation on a user-initiated sign out.
      // Fired before credentials are cleared and never awaited: local
      // sign-out is immediate whether or not the network is available.
      if (logout.match(action) && sessionService.hasSession()) {
        dispatch(authApi.endpoints.logout.initiate())
          .unwrap()
          .catch(() => undefined);
      }
      // Let the request that discovered an expiry settle with its real
      // error before the cache it lives in is wiped.
      await delay(0);
      dispatch(baseApi.util.resetApiState());
      await sessionService.clear();
    },
  });
}
