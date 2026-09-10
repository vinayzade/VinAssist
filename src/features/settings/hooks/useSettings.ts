import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  resetSettings,
  selectSettings,
  setHapticsEnabled,
  setLanguage,
  setThemeMode,
} from '../store/settingsSlice';
import type { Language, ThemeMode } from '../types';

export function useSettings() {
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectSettings);

  return {
    ...settings,
    setThemeMode: useCallback(
      (mode: ThemeMode) => dispatch(setThemeMode(mode)),
      [dispatch],
    ),
    setLanguage: useCallback(
      (lang: Language) => dispatch(setLanguage(lang)),
      [dispatch],
    ),
    setHapticsEnabled: useCallback(
      (enabled: boolean) => dispatch(setHapticsEnabled(enabled)),
      [dispatch],
    ),
    resetSettings: useCallback(() => dispatch(resetSettings()), [dispatch]),
  };
}
