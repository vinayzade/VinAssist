import { isAnyOf } from '@reduxjs/toolkit';
import { STORAGE_KEYS } from '@/constants';
import { storage } from '@/services/storage';
import { startAppListening } from '@/store/listenerMiddleware';
import {
  resetSettings,
  setHapticsEnabled,
  setLanguage,
  setThemeMode,
  type PersistedSettings,
} from './settingsSlice';

/**
 * Persists settings whenever they change. Reading them back happens in the
 * `restoreSettings` thunk so the reducer stays synchronous and pure.
 */
export function registerSettingsListeners() {
  startAppListening({
    matcher: isAnyOf(
      setThemeMode,
      setLanguage,
      setHapticsEnabled,
      resetSettings,
    ),
    effect: async (_action, { getState }) => {
      const { hydrated, ...persisted } = getState().settings;
      if (hydrated) {
        await storage.setItem<PersistedSettings>(
          STORAGE_KEYS.SETTINGS,
          persisted,
        );
      }
    },
  });
}
