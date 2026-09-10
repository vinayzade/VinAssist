import type { ThemeColors } from './colors';
import type { radius } from './radius';
import type { ThemeShadows } from './shadows';
import type { layout, spacing } from './spacing';
import type { typography } from './typography';

/** Resolved scheme. The user *preference* (which may be 'system') lives in the settings slice. */
export type ThemeScheme = 'light' | 'dark';

/**
 * The complete design-token bundle handed to components via `useTheme()`.
 * Only `colors` and `shadows` differ between light and dark; the remaining
 * tokens are mode-independent.
 */
export interface Theme {
  mode: ThemeScheme;
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  layout: typeof layout;
  radius: typeof radius;
  typography: typeof typography;
  shadows: ThemeShadows;
}
