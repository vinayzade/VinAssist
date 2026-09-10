import React from 'react';
import { Text, type TextProps } from 'react-native';
import { useTheme, type ThemeColors, type TypographyVariant } from '@/theme';

/** Semantic text colours a screen may pick from; never raw hex. */
export type AppTextColor = Extract<
  keyof ThemeColors,
  | 'text'
  | 'textSecondary'
  | 'textMuted'
  | 'textDisabled'
  | 'textInverse'
  | 'textLink'
  | 'primary'
  | 'onPrimary'
  | 'onPrimarySoft'
  | 'accent'
  | 'iconMuted'
  | 'onOverlay'
  | 'onOverlayMuted'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
>;

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: AppTextColor;
  /** Shorthand for `color="textMuted"`. */
  muted?: boolean;
  align?: 'auto' | 'left' | 'center' | 'right';
}

export function AppText({
  variant = 'body',
  color,
  muted,
  align,
  style,
  ...rest
}: AppTextProps) {
  const { colors, typography } = useTheme();
  const resolvedColor = colors[color ?? (muted ? 'textMuted' : 'text')];

  return (
    <Text
      style={[
        typography[variant],
        { color: resolvedColor },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
