import { lightColors } from './colors';
import { radius } from './radius';
import { lightShadows } from './shadows';
import { layout, spacing } from './spacing';
import type { Theme } from './theme';
import { typography } from './typography';

export const lightTheme: Theme = {
  mode: 'light',
  isDark: false,
  colors: lightColors,
  spacing,
  layout,
  radius,
  typography,
  shadows: lightShadows,
};
