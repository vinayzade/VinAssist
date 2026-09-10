import {
  getApiErrorMessage,
  isApiError,
  type ApiError,
  type ApiQueryError,
} from '@/services/api/apiError';

export type AuthErrorKind =
  | 'invalid-credentials'
  | 'email-taken'
  | 'validation'
  | 'network'
  | 'rate-limited'
  | 'server'
  | 'unknown';

export interface AuthFailure {
  kind: AuthErrorKind;
  /** Message for the form-level banner. */
  message: string;
  /** Messages to attach to specific fields (from a 422 or a known code). */
  fieldErrors: Record<string, string>;
  /** Whether a retry is likely to help without changing the input. */
  retryable: boolean;
}

/** Field name the backend used, mapped to the form's field name. */
const FIELD_ALIASES: Record<string, string> = {
  username: 'email',
  password1: 'password',
  password2: 'confirmPassword',
};

function fieldErrorsFrom(error: ApiError): Record<string, string> {
  const detail = (error.details as { detail?: unknown } | undefined)?.detail;
  if (!Array.isArray(detail)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const item of detail as { loc?: unknown[]; msg?: unknown }[]) {
    const raw = Array.isArray(item.loc)
      ? String(item.loc[item.loc.length - 1])
      : undefined;
    if (raw && typeof item.msg === 'string' && !out[raw]) {
      out[FIELD_ALIASES[raw] ?? raw] = item.msg;
    }
  }
  return out;
}

/**
 * Classifies an auth API failure into something a screen can act on:
 * which banner to show, which fields to mark, and whether "try again" is
 * meaningful. Keeps every user-facing string in one place.
 */
export function classifyAuthError(
  error: ApiQueryError | undefined,
  context: 'login' | 'register' | 'forgot-password' = 'login',
): AuthFailure {
  const generic = getApiErrorMessage(error);

  if (!isApiError(error)) {
    return {
      kind: 'unknown',
      message: generic,
      fieldErrors: {},
      retryable: true,
    };
  }

  switch (error.status) {
    case 'NETWORK':
    case 'TIMEOUT':
      return {
        kind: 'network',
        message:
          'We could not reach the server. Check your connection and try again.',
        fieldErrors: {},
        retryable: true,
      };
    case 401:
    case 400:
      if (context === 'login') {
        return {
          kind: 'invalid-credentials',
          message: 'Incorrect email or password.',
          fieldErrors: {},
          retryable: false,
        };
      }
      return {
        kind: 'validation',
        message: generic,
        fieldErrors: {},
        retryable: false,
      };
    case 409:
      return {
        kind: 'email-taken',
        message: 'An account with that email already exists.',
        fieldErrors: { email: 'Already registered. Try signing in.' },
        retryable: false,
      };
    case 422: {
      const fieldErrors = fieldErrorsFrom(error);
      return {
        kind: 'validation',
        message:
          Object.keys(fieldErrors).length > 0
            ? 'Please fix the highlighted fields.'
            : generic,
        fieldErrors,
        retryable: false,
      };
    }
    case 429:
      return {
        kind: 'rate-limited',
        message: 'Too many attempts. Please wait a minute and try again.',
        fieldErrors: {},
        retryable: true,
      };
    default:
      if (typeof error.status === 'number' && error.status >= 500) {
        return {
          kind: 'server',
          message: 'The server is having trouble. Please try again shortly.',
          fieldErrors: {},
          retryable: true,
        };
      }
      return {
        kind: 'unknown',
        message: generic,
        fieldErrors: {},
        retryable: true,
      };
  }
}
