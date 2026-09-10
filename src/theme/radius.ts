/**
 * Corner radii. `md` is the default for controls, `lg` for cards and
 * sheets, `full` for pills and avatars.
 */
export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  xxl: 28,
  full: 999,
} as const;

export type RadiusToken = keyof typeof radius;
