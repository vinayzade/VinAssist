import { createSlice, isAnyOf, type PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '@/services/api/authApi';
import { userApi } from '@/services/api/userApi';
import type { AuthSession, AuthState, User } from '../types';
import { sessionExpired } from './authActions';
import { initializeSession } from './authThunks';

/**
 * Client / session state only.
 *
 *  - Tokens live in `sessionService` (memory + Keychain), never here.
 *  - Request state (loading / error) lives in RTK Query hooks, never here.
 *  - This slice answers: is someone signed in, who, and have we finished
 *    checking at launch.
 */
const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  initializing: true,
  signOutReason: null,
};

function signIn(state: AuthState, user: User) {
  state.isAuthenticated = true;
  state.user = user;
  state.signOutReason = null;
}

function signOut(state: AuthState, reason: AuthState['signOutReason']) {
  state.isAuthenticated = false;
  state.user = null;
  state.signOutReason = reason;
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Marks a session as active. Used by the launch flow and by tests;
     * screens never call this directly because login / register already
     * flow through the matchers below.
     */
    sessionStarted(state, { payload }: PayloadAction<AuthSession>) {
      signIn(state, payload.user);
    },
    /** User-initiated sign out. Side effects happen in `authListeners`. */
    logout(state) {
      signOut(state, 'user');
    },
    /** Login screen has shown the "session expired" notice. */
    signOutReasonAcknowledged(state) {
      state.signOutReason = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(initializeSession.pending, state => {
        state.initializing = true;
      })
      .addCase(initializeSession.fulfilled, (state, { payload }) => {
        state.initializing = false;
        switch (payload.status) {
          case 'authenticated':
            signIn(state, payload.user);
            break;
          case 'unverified':
            state.isAuthenticated = true;
            state.user = payload.user;
            break;
          case 'unauthenticated':
            signOut(state, payload.reason === 'rejected' ? 'expired' : null);
            break;
        }
      })
      .addCase(initializeSession.rejected, state => {
        state.initializing = false;
        signOut(state, null);
      })
      // Server rejected the token and refresh failed (dispatched by baseApi).
      .addCase(sessionExpired, state => {
        signOut(state, 'expired');
      })
      .addMatcher(
        isAnyOf(
          authApi.endpoints.login.matchFulfilled,
          authApi.endpoints.register.matchFulfilled,
        ),
        (state, { payload }) => {
          signIn(state, payload.user);
        },
      )
      .addMatcher(
        userApi.endpoints.getMe.matchFulfilled,
        (state, { payload }) => {
          if (state.isAuthenticated) {
            state.user = {
              id: payload.id,
              name: payload.name,
              email: payload.email,
            };
          }
        },
      );
  },
  selectors: {
    selectAuth: state => state,
    selectUser: state => state.user,
    selectIsAuthenticated: state => state.isAuthenticated,
    selectAuthInitializing: state => state.initializing,
    selectSignOutReason: state => state.signOutReason,
  },
});

export const { sessionStarted, logout, signOutReasonAcknowledged } =
  authSlice.actions;
export { sessionExpired, initializeSession };
export const {
  selectAuth,
  selectUser,
  selectIsAuthenticated,
  selectAuthInitializing,
  selectSignOutReason,
} = authSlice.selectors;
export const authReducer = authSlice.reducer;
