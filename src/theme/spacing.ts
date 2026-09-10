/**
 * 4pt spacing scale. Use these for padding, margin and gap; never write raw
 * pixel values in screens. Combine tokens (`spacing.md + spacing.xs`) only
 * inside the design system itself.
 */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Layout-level constants derived from the scale. */
export const layout = {
  /** Horizontal inset for screen content. */
  screenPadding: spacing.md,
  /** Vertical gap between stacked sections. */
  sectionGap: spacing.lg,
  /** Gap between sibling cards / list rows. */
  itemGap: spacing.sm,
  /** Minimum touch target size (Apple HIG / Material). */
  touchTarget: 44,
  /** Standard header height, excluding the status bar. */
  headerHeight: 56,
  /** Max content width for tablets / large phones in landscape. */
  maxContentWidth: 640,
} as const;
