import { darkColors } from './colors';
import { radius } from './radius';
import { darkShadows } from './shadows';
import { layout, spacing } from './spacing';
import type { Theme } from './theme';
import { typography } from './typography';

export const darkTheme: Theme = {
  mode: 'dark',
  isDark: true,
  colors: darkColors,
  spacing,
  layout,
  radius,
  typography,
  shadows: darkShadows,
};
