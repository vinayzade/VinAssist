import { createAction } from '@reduxjs/toolkit';

/**
 * Auth actions the network layer dispatches. Defined separately from the
 * slice so `baseApi` can import them without a circular dependency
 * (`baseApi -> authSlice -> authApi -> baseApi`).
 */

/** The server rejected the token and a refresh was not possible. */
export const sessionExpired = createAction('auth/sessionExpired');
