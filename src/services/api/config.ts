import { env } from '@/config';

/** Versioned API root. Every endpoint path is relative to this. */
export const API_PREFIX = '/api/v1';
export const API_URL = `${env.API_BASE_URL}${API_PREFIX}`;

/**
 * Request timeout strategy, in milliseconds.
 *
 * - `default`: ordinary JSON calls. Anything slower is treated as a failure
 *   so the UI never hangs on a dead connection.
 * - `upload`: multipart uploads on mobile networks.
 * - `ai`: model inference (OCR, vision, chat), which is legitimately slow.
 *
 * Endpoints opt into a longer budget via `extraOptions: { timeout }`.
 */
export const TIMEOUTS = {
  default: 15_000,
  upload: 60_000,
  ai: 90_000,
} as const;

/**
 * Retry strategy. Only idempotent reads (`type === 'query'`) are retried,
 * and only for transient failures: network errors, timeouts, 5xx, 429.
 * Mutations are never retried automatically because the server may have
 * applied them before the response was lost.
 */
export const RETRY = {
  maxAttempts: 2,
  /** Exponential backoff base; attempt n waits base * 2^n (+ jitter). */
  backoffBaseMs: 300,
  backoffMaxMs: 3_000,
} as const;

/** Cache tag types shared by every injected endpoint. */
export const API_TAGS = ['User', 'Document', 'History'] as const;
export type ApiTag = (typeof API_TAGS)[number];
