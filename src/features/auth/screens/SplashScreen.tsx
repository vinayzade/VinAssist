import React from 'react';
import { View } from 'react-native';
import { AppText, LoadingIndicator } from '@/components';
import { APP_NAME } from '@/constants';
import { createStyles } from '@/theme';

const useStyles = createStyles(t => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.md,
    backgroundColor: t.colors.background,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: t.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primary,
    marginBottom: t.spacing.sm,
    ...t.shadows.glow,
  },
}));

/**
 * Shown while the app initialises the session (reads secure storage,
 * validates or refreshes the token) and restores settings. It is a real
 * route in the root stack so it participates in navigation, transitions
 * and analytics like every other screen.
 */
export function SplashScreen() {
  const styles = useStyles();

  return (
    <View
      style={styles.root}
      accessibilityRole="progressbar"
      accessibilityLabel={`Loading ${APP_NAME}`}
      testID="splash-screen"
    >
      <View style={styles.mark}>
        <AppText variant="h2" color="onPrimary">
          ✦
        </AppText>
      </View>
      <AppText variant="h2">{APP_NAME}</AppText>
      <LoadingIndicator />
    </View>
  );
}
