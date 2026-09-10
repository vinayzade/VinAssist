/**
 * Typed keys for `react-native-config`. Keep this in sync with `.env.example`.
 * Values are `string | undefined` at this level; `src/config/env.ts`
 * validates them and exposes a fully typed `env` object.
 */
declare module 'react-native-config' {
  export interface NativeConfig {
    APP_ENV?: string;
    API_BASE_URL?: string;
  }
}
