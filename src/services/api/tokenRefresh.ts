import type {
  BaseQueryApi,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from '@reduxjs/toolkit/query';
import { sessionService } from '@/features/auth/services/sessionService';
import { logger } from '@/utils/logger';
import type { ApiExtraOptions } from './types';

/** Contract for `POST /api/v1/auth/refresh`. */
export interface RefreshRequest {
  refreshToken: string;
}
export interface RefreshResponse {
  accessToken: string;
  /** Present when the backend rotates refresh tokens. */
  refreshToken?: string;
}

export type RefreshOutcome =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'no-refresh-token' | 'rejected' | 'network' };

export type RawBaseQuery = BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError,
  ApiExtraOptions
>;

/**
 * Single-flight guard. While a refresh is in progress every caller awaits
 * the same promise, so N concurrent 401s produce exactly one refresh call
 * and then N retries with the new token.
 */
let inFlight: Promise<RefreshOutcome> | null = null;

function isRefreshResponse(data: unknown): data is RefreshResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as RefreshResponse).accessToken === 'string' &&
    (data as RefreshResponse).accessToken.length > 0
  );
}

async function performRefresh(
  rawBaseQuery: RawBaseQuery,
  api: BaseQueryApi,
): Promise<RefreshOutcome> {
  const refreshToken = await sessionService.getRefreshToken();
  if (!refreshToken) {
    return { ok: false, reason: 'no-refresh-token' };
  }

  const result = await rawBaseQuery(
    {
      url: '/auth/refresh',
      method: 'POST',
      body: { refreshToken } satisfies RefreshRequest,
    },
    api,
    // Never send the stale bearer, and never recurse into another refresh.
    { skipAuth: true, skipRefresh: true },
  );

  if (result.error) {
    const transport =
      result.error.status === 'FETCH_ERROR' ||
      result.error.status === 'TIMEOUT_ERROR';
    logger.warn('[auth] token refresh failed', result.error);
    return { ok: false, reason: transport ? 'network' : 'rejected' };
  }

  if (!isRefreshResponse(result.data)) {
    logger.warn('[auth] token refresh returned an unexpected body');
    return { ok: false, reason: 'rejected' };
  }

  const { accessToken, refreshToken: rotated } = result.data;
  await sessionService.rotate({ accessToken, refreshToken: rotated });
  return { ok: true, accessToken };
}

/**
 * Refreshes the access token, deduplicating concurrent calls. Resolves
 * (never rejects) with the outcome so callers can decide whether to retry.
 */
export function refreshAccessToken(
  rawBaseQuery: RawBaseQuery,
  api: BaseQueryApi,
): Promise<RefreshOutcome> {
  if (!inFlight) {
    inFlight = performRefresh(rawBaseQuery, api)
      .catch((error): RefreshOutcome => {
        logger.error('[auth] token refresh threw', error);
        return { ok: false, reason: 'network' };
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** True while a refresh is in progress. Exposed for tests and diagnostics. */
export function isRefreshInFlight(): boolean {
  return inFlight !== null;
}
