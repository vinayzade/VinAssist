import {
  createApi,
  fetchBaseQuery,
  retry,
  type BaseQueryFn,
  type FetchArgs,
} from '@reduxjs/toolkit/query/react';
import { sessionService } from '@/features/auth/services/sessionService';
import { sessionExpired } from '@/features/auth/store/authActions';
import { toApiError, type ApiError } from './apiError';
import { API_TAGS, API_URL, RETRY, TIMEOUTS } from './config';
import { refreshAccessToken, type RawBaseQuery } from './tokenRefresh';
import type { ApiExtraOptions } from './types';

/* ------------------------------------------------------------------------ */
/* 1. Transport: fetch + headers + timeout                                  */
/* ------------------------------------------------------------------------ */

const rawBaseQuery: RawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  timeout: TIMEOUTS.default,
  // JSON when the server says so, text otherwise, so an HTML error page or
  // plain-text 401 body does not surface as a parsing error.
  responseHandler: 'content-type',
  prepareHeaders: (headers, { extraOptions, arg }) => {
    const { skipAuth } = (extraOptions ?? {}) as ApiExtraOptions;
    // In-memory, mirrored from Keychain; never read from Redux.
    const token = sessionService.getAccessToken();
    if (token && !skipAuth) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.set('Accept', 'application/json');

    // Let fetch set the multipart boundary for FormData bodies.
    const body = typeof arg === 'string' ? undefined : arg.body;
    const isFormData =
      typeof FormData !== 'undefined' && body instanceof FormData;
    if (!isFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  },
});

/** Applies a per-endpoint timeout override without mutating the caller's args. */
function withTimeout(
  args: string | FetchArgs,
  extraOptions: ApiExtraOptions | undefined,
): string | FetchArgs {
  const timeout = extraOptions?.timeout;
  if (timeout === undefined) {
    return args;
  }
  return typeof args === 'string'
    ? { url: args, timeout }
    : { ...args, timeout };
}

/* ------------------------------------------------------------------------ */
/* 2. Auth: bearer expiry -> single refresh -> retry                        */
/* ------------------------------------------------------------------------ */

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  ApiError,
  ApiExtraOptions
> = async (args, api, extraOptions) => {
  const request = withTimeout(args, extraOptions);
  let result = await rawBaseQuery(request, api, extraOptions);

  const unauthorized =
    result.error !== undefined &&
    (result.error.status === 401 ||
      ('originalStatus' in result.error &&
        result.error.originalStatus === 401));

  const hadToken = sessionService.hasSession();

  if (
    unauthorized &&
    hadToken &&
    !extraOptions?.skipAuth &&
    !extraOptions?.skipRefresh
  ) {
    const refreshed = await refreshAccessToken(rawBaseQuery, api);

    if (refreshed.ok) {
      // prepareHeaders reads the rotated token from sessionService, so a
      // plain re-run picks it up.
      result = await rawBaseQuery(request, api, extraOptions);
    } else if (refreshed.reason !== 'network') {
      // The refresh token is gone or rejected: the session is over.
      await sessionService.clear();
      api.dispatch(sessionExpired());
    }
    // On a transport failure during refresh we keep the session and surface
    // the original 401; the next request will try again.
  }

  if (result.error) {
    return { error: toApiError(result.error), meta: result.meta };
  }
  return { data: result.data, meta: result.meta };
};

/* ------------------------------------------------------------------------ */
/* 3. Resilience: bounded retries for idempotent reads only                 */
/* ------------------------------------------------------------------------ */

const TRANSIENT_STATUSES = new Set<ApiError['status']>([
  'NETWORK',
  'TIMEOUT',
  429,
  500,
  502,
  503,
  504,
]);

async function backoff(attempt: number, _max: number, signal?: AbortSignal) {
  const base = RETRY.backoffBaseMs * 2 ** attempt;
  const jitter = Math.random() * RETRY.backoffBaseMs;
  const delay = Math.min(base + jitter, RETRY.backoffMaxMs);
  await new Promise<void>(resolve => {
    const timer = setTimeout(resolve, delay);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const baseQueryWithRetry = retry(baseQueryWithReauth, {
  backoff,
  retryCondition: (error, _args, { attempt, baseQueryApi, extraOptions }) => {
    const maxRetries =
      (extraOptions as ApiExtraOptions | undefined)?.maxRetries ??
      RETRY.maxAttempts;
    if (attempt > maxRetries) {
      return false;
    }
    // Mutations are never retried: the server may already have applied them.
    if (baseQueryApi.type !== 'query') {
      return false;
    }
    return TRANSIENT_STATUSES.has((error as ApiError).status);
  },
});

/* ------------------------------------------------------------------------ */
/* 4. The API                                                               */
/* ------------------------------------------------------------------------ */

/**
 * Single RTK Query API for the whole app. Modules (`authApi`, `userApi`,
 * `documentApi`, `aiApi`, `historyApi`) call `baseApi.injectEndpoints` so
 * every endpoint shares one cache, one middleware, one reducer, and the
 * auth / timeout / retry behaviour defined above.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithRetry,
  tagTypes: API_TAGS,
  // Revalidate list data when the app returns to the foreground.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});

export type BaseApi = typeof baseApi;
