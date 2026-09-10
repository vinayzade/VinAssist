import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { STORAGE_KEYS } from '@/constants';
import { storage } from '@/services/storage';
import type { Language, SettingsState, ThemeMode } from '../types';

export const initialSettingsState: SettingsState = {
  themeMode: 'system',
  language: 'en',
  hapticsEnabled: true,
  hydrated: false,
};

/** The subset of settings that is persisted between launches. */
export type PersistedSettings = Omit<SettingsState, 'hydrated'>;

/** Reads persisted settings from storage on app start. Not a network call. */
export const restoreSettings =
  createAsyncThunk<Partial<PersistedSettings> | null>('settings/restore', () =>
    storage.getItem<Partial<PersistedSettings>>(STORAGE_KEYS.SETTINGS),
  );

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialSettingsState,
  reducers: {
    setThemeMode(state, { payload }: PayloadAction<ThemeMode>) {
      state.themeMode = payload;
    },
    setLanguage(state, { payload }: PayloadAction<Language>) {
      state.language = payload;
    },
    setHapticsEnabled(state, { payload }: PayloadAction<boolean>) {
      state.hapticsEnabled = payload;
    },
    resetSettings() {
      return { ...initialSettingsState, hydrated: true };
    },
  },
  extraReducers: builder => {
    builder
      .addCase(restoreSettings.fulfilled, (state, { payload }) => {
        Object.assign(state, payload ?? {});
        state.hydrated = true;
      })
      .addCase(restoreSettings.rejected, state => {
        state.hydrated = true;
      });
  },
  selectors: {
    selectSettings: state => state,
    selectThemeMode: state => state.themeMode,
    selectLanguage: state => state.language,
    selectHapticsEnabled: state => state.hapticsEnabled,
  },
});

export const { setThemeMode, setLanguage, setHapticsEnabled, resetSettings } =
  settingsSlice.actions;
export const {
  selectSettings,
  selectThemeMode,
  selectLanguage,
  selectHapticsEnabled,
} = settingsSlice.selectors;
export const settingsReducer = settingsSlice.reducer;
