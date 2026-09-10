import React, { type PropsWithChildren } from 'react';
import {
  Pressable,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { createStyles, useTheme, type SpacingToken } from '@/theme';

export type AppCardVariant = 'elevated' | 'outlined' | 'filled' | 'tinted';

export interface AppCardProps extends PropsWithChildren {
  variant?: AppCardVariant;
  /** Inner padding token. Defaults to `md`. */
  padding?: SpacingToken;
  /** Makes the card tappable with a pressed state. */
  onPress?: PressableProps['onPress'];
  onLongPress?: PressableProps['onLongPress'];
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = createStyles(t => ({
  base: {
    borderRadius: t.radius.lg,
    borderWidth: 1,
    overflow: 'visible',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
}));

export function AppCard({
  variant = 'elevated',
  padding = 'md',
  onPress,
  onLongPress,
  disabled,
  accessibilityLabel,
  style,
  testID,
  children,
}: AppCardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { colors, shadows, spacing } = theme;

  const surface: ViewStyle = (() => {
    switch (variant) {
      case 'outlined':
        return {
          backgroundColor: colors.background,
          borderColor: colors.borderStrong,
        };
      case 'filled':
        return {
          backgroundColor: colors.surfaceSunken,
          borderColor: 'transparent',
        };
      case 'tinted':
        return {
          backgroundColor: colors.primarySoft,
          borderColor: 'transparent',
        };
      case 'elevated':
      default:
        return {
          backgroundColor: colors.surfaceElevated,
          // Dark mode relies on the border for definition; light on shadow.
          borderColor: theme.isDark ? colors.border : 'transparent',
          ...shadows.md,
        };
    }
  })();

  const composed = [styles.base, surface, { padding: spacing[padding] }, style];

  if (onPress || onLongPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        testID={testID}
        style={({ pressed }) => [
          composed,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[composed, disabled && styles.disabled]}
    >
      {children}
    </View>
  );
}
