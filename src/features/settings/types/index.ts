export type ThemeMode = 'system' | 'light' | 'dark';

export type Language = 'en' | 'hi' | 'te';

export interface SettingsState {
  themeMode: ThemeMode;
  language: Language;
  hapticsEnabled: boolean;
  /** Read assistant answers aloud after a spoken question. */
  voiceRepliesEnabled: boolean;
  /** True once persisted settings have been read on app start. */
  hydrated: boolean;
}
