import React, { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { createStyles, useTheme, type ThemeColors } from '@/theme';
import { AppButton, type AppButtonProps } from './AppButton';
import { AppText } from './AppText';

export interface StatePlaceholderAction {
  title: string;
  onPress: () => void;
  variant?: AppButtonProps['variant'];
}

export interface StatePlaceholderProps {
  title: string;
  description?: string;
  /** Icon or illustration; a glyph string is rendered in a tinted circle. */
  icon?: ReactNode | string;
  tone?: 'neutral' | 'error';
  action?: StatePlaceholderAction;
  secondaryAction?: StatePlaceholderAction;
  /** Fill and centre in the parent (default) or render inline in a list. */
  fullscreen?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = createStyles(t => ({
  root: {
    alignItems: 'center',
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.xl,
    gap: t.spacing.sm,
  },
  fullscreen: { flex: 1, justifyContent: 'center' },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: t.spacing.sm,
  },
  actions: {
    alignSelf: 'stretch',
    marginTop: t.spacing.md,
    gap: t.spacing.sm,
  },
}));

/**
 * Shared layout for empty, error and similar "nothing to show" states so
 * they look identical across the app. Prefer `EmptyState` / `ErrorView`.
 */
export function StatePlaceholder({
  title,
  description,
  icon,
  tone = 'neutral',
  action,
  secondaryAction,
  fullscreen = true,
  style,
  testID,
}: StatePlaceholderProps) {
  const { colors } = useTheme();
  const styles = useStyles();

  const circleColor: keyof ThemeColors =
    tone === 'error' ? 'errorSoft' : 'primarySoft';
  const glyphColor = tone === 'error' ? 'error' : 'primary';

  return (
    <View
      style={[styles.root, fullscreen && styles.fullscreen, style]}
      testID={testID}
    >
      {icon ? (
        typeof icon === 'string' ? (
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: colors[circleColor] },
            ]}
          >
            <AppText variant="h2" color={glyphColor}>
              {icon}
            </AppText>
          </View>
        ) : (
          icon
        )
      ) : null}

      <AppText variant="h3" align="center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="body" color="textSecondary" align="center">
          {description}
        </AppText>
      ) : null}

      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? (
            <AppButton
              title={action.title}
              onPress={action.onPress}
              variant={action.variant ?? 'primary'}
              testID={testID ? `${testID}-action` : undefined}
            />
          ) : null}
          {secondaryAction ? (
            <AppButton
              title={secondaryAction.title}
              onPress={secondaryAction.onPress}
              variant={secondaryAction.variant ?? 'ghost'}
              testID={testID ? `${testID}-secondary` : undefined}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
