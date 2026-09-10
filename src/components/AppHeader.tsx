import React, { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyles, useTheme } from '@/theme';
import { AppText } from './AppText';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Renders a back chevron that calls this when pressed. */
  onBackPress?: () => void;
  /** Custom element on the left; overrides the back button. */
  left?: ReactNode;
  /** Actions on the right (icon buttons, a text button, ...). */
  right?: ReactNode;
  /** Large-title layout for top-level screens; compact for pushed screens. */
  size?: 'large' | 'compact';
  /** Pad for the status bar. Enable when the header is the first element. */
  withSafeArea?: boolean;
  /** Show a hairline under the header. */
  divider?: boolean;
}

const useStyles = createStyles(t => ({
  root: { paddingHorizontal: t.layout.screenPadding },
  bar: {
    minHeight: t.layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  side: {
    minWidth: t.layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
  },
  sideRight: { justifyContent: 'flex-end' },
  centre: { flex: 1 },
  large: { paddingTop: t.spacing.sm, paddingBottom: t.spacing.md },
  backButton: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    marginLeft: -t.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.full,
  },
  divider: { height: 1 },
}));

export function AppHeader({
  title,
  subtitle,
  onBackPress,
  left,
  right,
  size = 'large',
  withSafeArea = false,
  divider = false,
}: AppHeaderProps) {
  const { colors, spacing } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const isLarge = size === 'large';

  const leading =
    left ??
    (onBackPress ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={spacing.sm}
        onPress={onBackPress}
        style={({ pressed }) => [
          styles.backButton,
          pressed && { backgroundColor: colors.surfaceSunken },
        ]}
      >
        <AppText variant="h3" color="text">
          ‹
        </AppText>
      </Pressable>
    ) : null);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background },
        withSafeArea && { paddingTop: insets.top },
      ]}
    >
      <View style={styles.bar}>
        {leading ? <View style={styles.side}>{leading}</View> : null}
        {!isLarge ? (
          <View style={styles.centre}>
            <AppText variant="title" numberOfLines={1} align="center">
              {title}
            </AppText>
          </View>
        ) : (
          <View style={styles.centre} />
        )}
        {right ? (
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        ) : leading ? (
          <View style={styles.side} />
        ) : null}
      </View>

      {isLarge ? (
        <View style={styles.large}>
          <AppText variant="h1">{title}</AppText>
          {subtitle ? (
            <AppText
              variant="body"
              color="textSecondary"
              style={{ marginTop: spacing.xs }}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {divider ? (
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
      ) : null}
    </View>
  );
}
