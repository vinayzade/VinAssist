import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { createStyles, useTheme } from '@/theme';
import { AppText } from './AppText';

export interface LoadingIndicatorProps {
  /** Optional caption under the spinner. */
  message?: string;
  size?: 'small' | 'large';
  /** Fill the parent and centre the spinner (page-level loading). */
  fullscreen?: boolean;
  /** Dim the page behind the spinner; implies `fullscreen`. */
  overlay?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const useStyles = createStyles(t => ({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.sm,
  },
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.md,
    padding: t.spacing.lg,
  },
  overlay: { ...StyleSheet.absoluteFill },
}));

export function LoadingIndicator({
  message,
  size,
  fullscreen = false,
  overlay = false,
  style,
  testID = 'loading-indicator',
}: LoadingIndicatorProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isBlock = fullscreen || overlay;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? 'Loading'}
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[
        isBlock ? styles.fullscreen : styles.inline,
        overlay && [styles.overlay, { backgroundColor: colors.overlay }],
        style,
      ]}
    >
      <ActivityIndicator
        size={size ?? (isBlock ? 'large' : 'small')}
        color={overlay ? colors.textInverse : colors.primary}
      />
      {message ? (
        <AppText
          variant={isBlock ? 'body' : 'bodySmall'}
          color={overlay ? 'textInverse' : 'textMuted'}
          align="center"
        >
          {message}
        </AppText>
      ) : null}
    </View>
  );
}
