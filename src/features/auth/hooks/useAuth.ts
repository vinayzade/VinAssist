import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  logout as logoutAction,
  selectAuth,
  signOutReasonAcknowledged,
} from '../store/authSlice';

/**
 * Read-only view of the session plus sign-out. Login / register / forgot
 * password live in their own form hooks because each owns a form.
 */
export function useAuth() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user, initializing, signOutReason } =
    useAppSelector(selectAuth);

  return {
    isAuthenticated,
    user,
    initializing,
    /** 'expired' when the server ended the session; 'user' after sign out. */
    signOutReason,
    logout: useCallback(() => dispatch(logoutAction()), [dispatch]),
    acknowledgeSignOutReason: useCallback(
      () => dispatch(signOutReasonAcknowledged()),
      [dispatch],
    ),
  };
}
