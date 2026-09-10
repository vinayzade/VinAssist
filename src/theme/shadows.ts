import type { ViewStyle } from 'react-native';

/**
 * Elevation tokens covering both iOS (shadow*) and Android (elevation).
 * Dark mode uses deeper, softer shadows because light shadows on dark
 * surfaces read as noise; components pair `sm`/`md` with a 1px border in
 * dark mode for definition.
 */
export type Shadow = Pick<
  ViewStyle,
  | 'shadowColor'
  | 'shadowOffset'
  | 'shadowOpacity'
  | 'shadowRadius'
  | 'elevation'
>;

export interface ThemeShadows {
  none: Shadow;
  sm: Shadow;
  md: Shadow;
  lg: Shadow;
  /** Coloured glow for primary / AI emphasis (e.g. a floating action). */
  glow: Shadow;
}

export type ShadowToken = keyof ThemeShadows;

const NONE: Shadow = {
  shadowColor: 'transparent',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

export const lightShadows: ThemeShadows = {
  none: NONE,
  sm: {
    shadowColor: '#16161B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#16161B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#16161B',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
  glow: {
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const darkShadows: ThemeShadows = {
  none: NONE,
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 10,
  },
  glow: {
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 6,
  },
};
