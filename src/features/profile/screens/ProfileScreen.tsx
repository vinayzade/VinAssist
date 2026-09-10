import React from 'react';
import { View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  ScreenContainer,
} from '@/components';
import { useNavigation } from '@react-navigation/native';
import { isDevelopment } from '@/config';
import { useAuth } from '@/features/auth';
import { useSettings, type ThemeMode } from '@/features/settings';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import { createStyles } from '@/theme';

const THEME_OPTIONS: { label: string; value: ThemeMode }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  identity: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primarySoft,
  },
  identityText: { flex: 1, gap: t.spacing.xxs },
  section: { gap: t.spacing.sm },
  segment: { flexDirection: 'row', gap: t.spacing.sm },
  segmentButton: { flex: 1 },
}));

export function ProfileScreen() {
  const styles = useStyles();
  const navigation =
    useNavigation<MainTabScreenProps<'Profile'>['navigation']>();
  const { user, logout } = useAuth();
  const { themeMode, setThemeMode } = useSettings();
  const initial = user?.name?.trim().charAt(0).toUpperCase() || '?';

  return (
    <ScreenContainer edges={['top']} scroll>
      <AppHeader title="Profile" />

      <View style={styles.content}>
        <AppCard>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <AppText variant="h2" color="onPrimarySoft">
                {initial}
              </AppText>
            </View>
            <View style={styles.identityText}>
              <AppText variant="title">{user?.name}</AppText>
              <AppText variant="bodySmall" color="textSecondary">
                {user?.email}
              </AppText>
            </View>
          </View>
        </AppCard>

        <View style={styles.section}>
          <AppText variant="overline" color="textMuted">
            Appearance
          </AppText>
          <View style={styles.segment}>
            {THEME_OPTIONS.map(option => (
              <AppButton
                key={option.value}
                title={option.label}
                size="sm"
                variant={themeMode === option.value ? 'primary' : 'secondary'}
                style={styles.segmentButton}
                accessibilityState={{ selected: themeMode === option.value }}
                onPress={() => setThemeMode(option.value)}
              />
            ))}
          </View>
        </View>

        {isDevelopment ? (
          <View style={styles.section}>
            <AppText variant="overline" color="textMuted">
              Developer
            </AppText>
            <AppButton
              title="Backend status"
              variant="secondary"
              onPress={() => navigation.navigate('BackendStatus')}
              testID="profile-backend-status"
            />
          </View>
        ) : null}

        <AppButton title="Sign out" variant="danger" onPress={() => logout()} />
      </View>
    </ScreenContainer>
  );
}
