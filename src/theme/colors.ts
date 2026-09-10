/**
 * Raw palette. Never import this from screens or components; consume the
 * semantic `ThemeColors` from `useTheme()` instead so light/dark stay in sync.
 */
export const palette = {
  white: '#FFFFFF',
  black: '#000000',

  // Neutral scale: cool, low-saturation greys that read as "editorial".
  neutral0: '#FAFAFA',
  neutral50: '#F4F4F5',
  neutral100: '#E9E9EC',
  neutral200: '#D9D9DE',
  neutral300: '#B9B9C1',
  neutral400: '#8E8E99',
  neutral500: '#6B6B76',
  neutral600: '#4F4F59',
  neutral700: '#35353D',
  neutral800: '#23232A',
  neutral900: '#16161B',
  neutral950: '#0C0C10',

  // Brand accent: indigo -> violet, the "AI" signature colour.
  indigo300: '#A5B4FC',
  indigo400: '#818CF8',
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  indigo700: '#4338CA',
  violet400: '#A78BFA',
  violet500: '#8B5CF6',

  // Status colours, slightly desaturated to sit well on neutral surfaces.
  green400: '#4ADE80',
  green500: '#22C55E',
  green600: '#16A34A',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  amber600: '#D97706',
  red400: '#F87171',
  red500: '#EF4444',
  red600: '#DC2626',
  sky400: '#38BDF8',
  sky500: '#0EA5E9',
  sky600: '#0284C7',
} as const;

/**
 * Semantic colour roles. Every colour used in the UI must map to one of
 * these so that a screen never needs to know whether it is in light or dark
 * mode.
 */
export interface ThemeColors {
  /* Surfaces, from the page background up to floating layers. */
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSunken: string;
  overlay: string;

  /* Strokes. */
  border: string;
  borderStrong: string;
  borderFocus: string;
  divider: string;

  /* Text. */
  text: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textInverse: string;
  textLink: string;

  /* Brand / primary action. */
  primary: string;
  primaryPressed: string;
  primarySoft: string;
  onPrimary: string;
  onPrimarySoft: string;

  /* Accent, used sparingly for "AI" moments (glows, gradients, highlights). */
  accent: string;
  accentSoft: string;

  /* Status. Each has a strong (icon/text) and a soft (background) variant. */
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  info: string;
  infoSoft: string;

  /* Media chrome: fixed white-on-dark UI drawn over camera / image previews. */
  overlayStrong: string;
  overlayControl: string;
  onOverlay: string;
  onOverlayMuted: string;

  /* Controls. */
  inputBackground: string;
  placeholder: string;
  skeleton: string;
  iconMuted: string;
}

export const lightColors: ThemeColors = {
  background: palette.white,
  surface: palette.neutral0,
  surfaceElevated: palette.white,
  surfaceSunken: palette.neutral50,
  overlay: 'rgba(12, 12, 16, 0.45)',

  border: palette.neutral100,
  borderStrong: palette.neutral200,
  borderFocus: palette.indigo500,
  divider: palette.neutral100,

  text: palette.neutral900,
  textSecondary: palette.neutral600,
  textMuted: palette.neutral500,
  textDisabled: palette.neutral300,
  textInverse: palette.white,
  textLink: palette.indigo600,

  primary: palette.indigo600,
  primaryPressed: palette.indigo700,
  primarySoft: '#EEF0FE',
  onPrimary: palette.white,
  onPrimarySoft: palette.indigo700,

  accent: palette.violet500,
  accentSoft: '#F3EEFE',

  success: palette.green600,
  successSoft: '#E8F8EE',
  warning: palette.amber600,
  warningSoft: '#FEF5E3',
  error: palette.red600,
  errorSoft: '#FDECEC',
  info: palette.sky600,
  infoSoft: '#E6F5FD',

  overlayStrong: 'rgba(0, 0, 0, 0.55)',
  overlayControl: 'rgba(255, 255, 255, 0.16)',
  onOverlay: palette.white,
  onOverlayMuted: 'rgba(255, 255, 255, 0.7)',

  inputBackground: palette.white,
  placeholder: palette.neutral400,
  skeleton: palette.neutral100,
  iconMuted: palette.neutral400,
};

export const darkColors: ThemeColors = {
  background: palette.neutral950,
  surface: palette.neutral900,
  surfaceElevated: palette.neutral800,
  surfaceSunken: palette.black,
  overlay: 'rgba(0, 0, 0, 0.6)',

  border: palette.neutral800,
  borderStrong: palette.neutral700,
  borderFocus: palette.indigo400,
  divider: palette.neutral800,

  text: palette.neutral0,
  textSecondary: palette.neutral300,
  textMuted: palette.neutral400,
  textDisabled: palette.neutral600,
  textInverse: palette.neutral950,
  textLink: palette.indigo300,

  primary: palette.indigo500,
  primaryPressed: palette.indigo400,
  primarySoft: 'rgba(99, 102, 241, 0.16)',
  onPrimary: palette.white,
  onPrimarySoft: palette.indigo300,

  accent: palette.violet400,
  accentSoft: 'rgba(139, 92, 246, 0.18)',

  success: palette.green400,
  successSoft: 'rgba(34, 197, 94, 0.16)',
  warning: palette.amber400,
  warningSoft: 'rgba(245, 158, 11, 0.16)',
  error: palette.red400,
  errorSoft: 'rgba(239, 68, 68, 0.16)',
  info: palette.sky400,
  infoSoft: 'rgba(14, 165, 233, 0.16)',

  overlayStrong: 'rgba(0, 0, 0, 0.55)',
  overlayControl: 'rgba(255, 255, 255, 0.16)',
  onOverlay: palette.white,
  onOverlayMuted: 'rgba(255, 255, 255, 0.7)',

  inputBackground: palette.neutral900,
  placeholder: palette.neutral500,
  skeleton: palette.neutral800,
  iconMuted: palette.neutral500,
};
