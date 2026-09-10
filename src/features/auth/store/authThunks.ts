import { createAsyncThunk } from '@reduxjs/toolkit';
import { isApiError } from '@/services/api/apiError';
import { userApi } from '@/services/api/userApi';
import type { AppDispatch, RootState } from '@/store';
import { logger } from '@/utils/logger';
import { sessionService } from '../services/sessionService';
import type { User } from '../types';

export type InitializeSessionResult =
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated'; reason: 'no-session' | 'rejected' }
  /** Stored session exists but could not be verified (offline). */
  | { status: 'unverified'; user: User | null };

/**
 * App-launch flow:
 *
 *   read secure storage -> token? -> validate with GET /users/me
 *                                      |- 200            -> authenticated
 *                                      |- 401 (+refresh) -> handled by baseApi:
 *                                      |     refresh ok  -> retried -> authenticated
 *                                      |     refresh bad -> sessionExpired -> unauthenticated
 *                                      '- network error  -> unverified (keep session)
 *
 * The refresh itself is not duplicated here: `baseApi` already performs it
 * for any 401, and `/users/me` is simply the cheapest authenticated call.
 */
export const initializeSession = createAsyncThunk<
  InitializeSessionResult,
  void,
  { state: RootState; dispatch: AppDispatch }
>('auth/initializeSession', async (_, { dispatch }) => {
  const restored = await sessionService.restore();
  if (!restored) {
    return { status: 'unauthenticated', reason: 'no-session' };
  }

  const result = await dispatch(
    userApi.endpoints.getMe.initiate(undefined, {
      forceRefetch: true,
      subscribe: false,
    }),
  );

  if (result.data) {
    const user: User = {
      id: result.data.id,
      name: result.data.name,
      email: result.data.email,
    };
    await sessionService.cacheUser(user);
    return { status: 'authenticated', user };
  }

  const error = result.error;
  const transport =
    isApiError(error) &&
    (error.status === 'NETWORK' || error.status === 'TIMEOUT');

  if (transport) {
    // Cannot prove the session is valid, cannot prove it is not. Let the
    // user in with cached data; the first successful request will confirm,
    // and a rejected refresh later will sign them out.
    logger.warn('[auth] session unverified (offline)');
    return { status: 'unverified', user: restored.user };
  }

  // Any other failure means the server rejected the session (and baseApi
  // has already dispatched sessionExpired and cleared tokens), or the
  // session was in an unusable state. Either way, start clean.
  await sessionService.clear();
  return { status: 'unauthenticated', reason: 'rejected' };
});
