import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

/**
 * Normalised error shape returned by every endpoint in `baseApi`.
 *
 * `status` is the HTTP status for server responses, or one of the transport
 * codes for failures that never produced a response. `message` is always
 * safe to show to a user; `details` carries the raw body for logging.
 */
export interface ApiError {
  status: number | 'NETWORK' | 'TIMEOUT' | 'PARSE' | 'UNKNOWN';
  /** Machine-readable code from the backend, when it sends one. */
  code?: string;
  message: string;
  details?: unknown;
}

export type ApiQueryError = ApiError | FetchBaseQueryError | SerializedError;

const GENERIC = 'Something went wrong. Please try again.';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do that.',
  404: 'The requested resource was not found.',
  409: 'That conflicts with something that already exists.',
  413: 'That file is too large.',
  422: 'Some of the information provided is invalid.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'The server encountered an error.',
  502: 'The server is temporarily unavailable.',
  503: 'The server is temporarily unavailable.',
  504: 'The server took too long to respond.',
};

/**
 * Extracts a human message from a FastAPI error body.
 *
 *   { detail: "Invalid credentials" }
 *   { detail: [{ loc: ["body", "email"], msg: "field required", type: ... }] }
 *   { message: "...", code: "..." }
 */
function messageFromBody(body: unknown): { message?: string; code?: string } {
  if (typeof body === 'string') {
    return { message: body.trim() || undefined };
  }
  if (!body || typeof body !== 'object') {
    return {};
  }
  const obj = body as Record<string, unknown>;
  const code = typeof obj.code === 'string' ? obj.code : undefined;

  if (typeof obj.detail === 'string') {
    return { message: obj.detail, code };
  }
  if (Array.isArray(obj.detail)) {
    const first = obj.detail[0] as
      | { msg?: unknown; loc?: unknown[] }
      | undefined;
    if (first && typeof first.msg === 'string') {
      const field = Array.isArray(first.loc)
        ? String(first.loc[first.loc.length - 1])
        : undefined;
      return {
        message: field ? `${field}: ${first.msg}` : first.msg,
        code: code ?? 'VALIDATION_ERROR',
      };
    }
  }
  if (typeof obj.message === 'string') {
    return { message: obj.message, code };
  }
  return { code };
}

/** Converts a raw `fetchBaseQuery` error into the app's `ApiError`. */
export function toApiError(error: FetchBaseQueryError): ApiError {
  switch (error.status) {
    case 'FETCH_ERROR':
      return {
        status: 'NETWORK',
        message: 'Network error. Check your connection and try again.',
        details: error.error,
      };
    case 'TIMEOUT_ERROR':
      return {
        status: 'TIMEOUT',
        message: 'The request timed out. Please try again.',
        details: error.error,
      };
    case 'PARSING_ERROR': {
      const { message } = messageFromBody(error.data);
      return {
        status: error.originalStatus,
        message: message ?? STATUS_MESSAGES[error.originalStatus] ?? GENERIC,
        details: error.data,
      };
    }
    case 'CUSTOM_ERROR':
      return {
        status: 'UNKNOWN',
        message: error.error || GENERIC,
        details: error.data,
      };
    default: {
      const { message, code } = messageFromBody(error.data);
      return {
        status: error.status,
        code,
        message: message ?? STATUS_MESSAGES[error.status] ?? GENERIC,
        details: error.data,
      };
    }
  }
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'message' in error &&
    typeof (error as ApiError).message === 'string'
  );
}

function isFetchBaseQueryError(error: unknown): error is FetchBaseQueryError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    !('message' in error)
  );
}

/**
 * Message for any error an RTK Query hook can hand back: a normalised
 * `ApiError`, a raw `FetchBaseQueryError`, or a thrown `SerializedError`.
 */
export function getApiErrorMessage(
  error: ApiQueryError | undefined,
  fallback = GENERIC,
): string {
  if (!error) {
    return fallback;
  }
  if (isApiError(error)) {
    return error.message || fallback;
  }
  if (isFetchBaseQueryError(error)) {
    return toApiError(error).message || fallback;
  }
  return error.message ?? fallback;
}

/** HTTP status of an error, or undefined for transport failures. */
export function getErrorStatus(
  error: ApiQueryError | undefined,
): number | undefined {
  if (!error) {
    return undefined;
  }
  if (isApiError(error)) {
    return typeof error.status === 'number' ? error.status : undefined;
  }
  if (isFetchBaseQueryError(error)) {
    if (typeof error.status === 'number') {
      return error.status;
    }
    return 'originalStatus' in error ? error.originalStatus : undefined;
  }
  return undefined;
}
