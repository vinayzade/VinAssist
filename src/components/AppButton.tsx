import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { createStyles, useTheme, type Theme } from '@/theme';
import { AppText, type AppTextColor } from './AppText';

export type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'link';
export type AppButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  loading?: boolean;
  /** Stretch to the container width. Defaults to true for block layouts. */
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

interface VariantColors {
  background: string;
  backgroundPressed: string;
  border: string;
  text: AppTextColor;
  shadow: keyof Theme['shadows'];
}

function variantColors(theme: Theme, variant: AppButtonVariant): VariantColors {
  const { colors } = theme;
  switch (variant) {
    case 'primary':
      return {
        background: colors.primary,
        backgroundPressed: colors.primaryPressed,
        border: 'transparent',
        text: 'onPrimary',
        shadow: 'sm',
      };
    case 'secondary':
      return {
        background: colors.surfaceElevated,
        backgroundPressed: colors.surfaceSunken,
        border: colors.borderStrong,
        text: 'text',
        shadow: 'none',
      };
    case 'danger':
      return {
        background: colors.errorSoft,
        backgroundPressed: colors.errorSoft,
        border: 'transparent',
        text: 'error',
        shadow: 'none',
      };
    case 'link':
      return {
        background: 'transparent',
        backgroundPressed: 'transparent',
        border: 'transparent',
        text: 'textLink',
        shadow: 'none',
      };
    case 'ghost':
    default:
      return {
        background: 'transparent',
        backgroundPressed: colors.surfaceSunken,
        border: 'transparent',
        text: 'primary',
        shadow: 'none',
      };
  }
}

const useStyles = createStyles(t => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: t.radius.md,
    gap: t.spacing.sm,
  },
  sm: {
    minHeight: 36,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  md: {
    minHeight: t.layout.touchTarget,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.sm,
  },
  lg: {
    minHeight: 52,
    paddingHorizontal: t.spacing.xl,
    paddingVertical: t.spacing.md,
    borderRadius: t.radius.lg,
  },
  link: {
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: t.spacing.xs,
  },
  fullWidth: { alignSelf: 'stretch' },
  inline: { alignSelf: 'flex-start' },
  disabled: { opacity: 0.5 },
  hidden: { opacity: 0 },
  spinner: { position: 'absolute' },
}));

export function AppButton({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = true,
  leftIcon,
  rightIcon,
  disabled,
  style,
  ...rest
}: AppButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const v = variantColors(theme, variant);
  const isDisabled = Boolean(disabled) || loading;
  const textVariant = size === 'sm' ? 'buttonSmall' : 'button';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={variant === 'link' ? theme.spacing.sm : undefined}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        variant === 'link' && styles.link,
        fullWidth && variant !== 'link' ? styles.fullWidth : styles.inline,
        theme.shadows[v.shadow],
        {
          backgroundColor: pressed ? v.backgroundPressed : v.background,
          borderColor: v.border,
        },
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {leftIcon ? (
        <View style={loading && styles.hidden}>{leftIcon}</View>
      ) : null}
      <AppText
        variant={textVariant}
        color={v.text}
        style={loading && styles.hidden}
        numberOfLines={1}
      >
        {title}
      </AppText>
      {rightIcon ? (
        <View style={loading && styles.hidden}>{rightIcon}</View>
      ) : null}
      {loading ? (
        <ActivityIndicator
          style={styles.spinner}
          color={theme.colors[v.text]}
          size="small"
        />
      ) : null}
    </Pressable>
  );
}
