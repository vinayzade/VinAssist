import { useEffect } from 'react';
import { initializeSession, selectAuthInitializing } from '@/features/auth';
import { restoreSettings, selectSettings } from '@/features/settings';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

/**
 * Runs the app's start-up work exactly once: restores persisted settings and
 * initialises the session (read secure storage, validate / refresh the
 * token). Returns `isReady` once both have completed, which is the signal
 * to leave the splash screen.
 */
export function useAppBootstrap() {
  const dispatch = useAppDispatch();
  const authInitializing = useAppSelector(selectAuthInitializing);
  const settingsHydrated = useAppSelector(selectSettings).hydrated;

  useEffect(() => {
    dispatch(restoreSettings());
    dispatch(initializeSession());
  }, [dispatch]);

  return { isReady: !authInitializing && settingsHydrated };
}
