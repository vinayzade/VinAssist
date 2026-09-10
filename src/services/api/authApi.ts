import type {
  AuthSession,
  ForgotPasswordPayload,
  LoginCredentials,
  RegisterPayload,
  User,
} from '@/features/auth/types';
import { baseApi } from './baseApi';

/* ---------------------------- Backend contract ---------------------------- */

/** Response of `POST /auth/login` and `POST /auth/register`. */
export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface ResetPasswordPayload {
  token: string;
  password: string;
}

const toSession = (res: AuthResponse): AuthSession => ({
  user: res.user,
  token: res.accessToken,
  refreshToken: res.refreshToken,
});

/* ------------------------------- Endpoints ------------------------------- */

/**
 * `/api/v1/auth/*`. The auth slice listens to `login` / `register` via
 * `matchFulfilled`; persistence happens in the auth listeners. Token
 * refresh is not an endpoint here: it runs inside the base query so it can
 * transparently retry the failed request.
 */
export const authApi = baseApi.injectEndpoints({
  endpoints: build => ({
    login: build.mutation<AuthSession, LoginCredentials>({
      query: credentials => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      extraOptions: { skipAuth: true },
      transformResponse: toSession,
    }),

    register: build.mutation<AuthSession, RegisterPayload>({
      query: payload => ({
        url: '/auth/register',
        method: 'POST',
        body: payload,
      }),
      extraOptions: { skipAuth: true },
      transformResponse: toSession,
    }),

    /** Revokes the refresh token server-side. Local sign-out never waits on it. */
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      extraOptions: { skipRefresh: true },
    }),

    forgotPassword: build.mutation<void, ForgotPasswordPayload>({
      query: payload => ({
        url: '/auth/forgot-password',
        method: 'POST',
        body: payload,
      }),
      extraOptions: { skipAuth: true },
    }),

    resetPassword: build.mutation<void, ResetPasswordPayload>({
      query: payload => ({
        url: '/auth/reset-password',
        method: 'POST',
        body: payload,
      }),
      extraOptions: { skipAuth: true },
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = authApi;
