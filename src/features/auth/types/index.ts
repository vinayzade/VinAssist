export interface User {
  id: string;
  name: string;
  email: string;
}

/* ------------------------------ API payloads ------------------------------ */

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginCredentials {
  name: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

/** What login / register produce. Tokens go to `sessionService`, never Redux. */
export interface AuthSession {
  user: User;
  /** Short-lived access token, sent as a Bearer header. */
  token: string;
  /** Long-lived refresh token. Kept only in secure storage. */
  refreshToken?: string | null;
}

/* ------------------------------- Form values ------------------------------ */

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface RegisterFormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface ForgotPasswordFormValues {
  email: string;
}

/* ------------------------------ Client state ------------------------------ */

export type SignOutReason = 'user' | 'expired';

/**
 * Client / session state only. No tokens, no request state: those live in
 * `sessionService` and RTK Query respectively.
 */
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  /** True from app launch until the stored session has been checked. */
  initializing: boolean;
  /** Why the last session ended, so the login screen can explain. */
  signOutReason: SignOutReason | null;
}
