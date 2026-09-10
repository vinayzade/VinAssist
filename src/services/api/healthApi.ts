import { baseApi } from './baseApi';

/* ---------------------------- Backend contract ---------------------------- */

/** Response of `GET /api/v1/health`. */
export interface HealthResponse {
  status: 'healthy';
}

/* ------------------------------- Endpoints ------------------------------- */

/**
 * Connectivity probe. Public (no bearer token), never retried and never
 * cached, so the answer always reflects the backend *right now*. Uses a
 * short timeout: a health check that hangs is as useless as one that fails.
 */
export const HEALTH_TIMEOUT_MS = 5_000;

export const healthApi = baseApi.injectEndpoints({
  endpoints: build => ({
    getHealth: build.query<HealthResponse, void>({
      query: () => '/health',
      extraOptions: {
        skipAuth: true,
        skipRefresh: true,
        maxRetries: 0,
        timeout: HEALTH_TIMEOUT_MS,
      },
      keepUnusedDataFor: 0,
    }),
  }),
});

export const { useGetHealthQuery, useLazyGetHealthQuery } = healthApi;
