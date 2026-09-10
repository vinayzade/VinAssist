import { Platform, type TextStyle } from 'react-native';

/**
 * Font stacks. The system font (SF Pro / Roboto) keeps the UI native and
 * premium without shipping font files; a monospace stack is provided for
 * code, tokens and model output.
 */
export const fontFamily = {
  sans: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'System',
  }),
  sansMedium: Platform.select({
    ios: 'System',
    android: 'sans-serif-medium',
    default: 'System',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }),
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
  display: 36,
} as const;

/**
 * Type scale. Line heights are ~1.3x for headings and ~1.5x for body copy;
 * tight letter-spacing on large sizes gives the editorial feel.
 */
export const typography = {
  display: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    lineHeight: 42,
    letterSpacing: -0.8,
  },
  h1: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.bold,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  h2: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.semibold,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  h3: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  title: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: 22,
  },
  bodyLarge: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.regular,
    lineHeight: 26,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    lineHeight: 22,
  },
  bodySmall: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: 18,
  },
  label: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    lineHeight: 16,
  },
  overline: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  buttonSmall: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: 18,
  },
  mono: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: 20,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
