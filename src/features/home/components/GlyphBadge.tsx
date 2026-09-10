import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components';
import { createStyles, useTheme, type ThemeColors } from '@/theme';
import type { DashboardAction } from '../types';

export type BadgeTone = NonNullable<DashboardAction['tone']>;

interface GlyphBadgeProps {
  glyph: string;
  tone?: BadgeTone;
  size?: 'md' | 'lg';
}

const TONE_COLORS: Record<
  BadgeTone,
  { background: keyof ThemeColors; foreground: keyof ThemeColors }
> = {
  primary: { background: 'primarySoft', foreground: 'onPrimarySoft' },
  accent: { background: 'accentSoft', foreground: 'accent' },
  info: { background: 'infoSoft', foreground: 'info' },
  success: { background: 'successSoft', foreground: 'success' },
  warning: { background: 'warningSoft', foreground: 'warning' },
};

const useStyles = createStyles(t => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.md,
  },
  md: { width: 44, height: 44 },
  lg: { width: 52, height: 52, borderRadius: t.radius.lg },
}));

/** Tinted square with a single glyph; the visual anchor of every card. */
export function GlyphBadge({
  glyph,
  tone = 'primary',
  size = 'md',
}: GlyphBadgeProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { background, foreground } = TONE_COLORS[tone];

  return (
    <View
      style={[
        styles.base,
        styles[size],
        { backgroundColor: colors[background] },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <AppText
        variant={size === 'lg' ? 'h2' : 'h3'}
        style={{ color: colors[foreground] }}
      >
        {glyph}
      </AppText>
    </View>
  );
}
