import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  ScreenContainer,
} from '@/components';
import { env } from '@/config';
import { createStyles, fontFamily, useTheme } from '@/theme';
import { useBackendStatus, type BackendStatus } from '../hooks/useBackendStatus';

const STATUS_LABEL: Record<BackendStatus, string> = {
  checking: 'Checking backend…',
  connected: 'Backend Connected',
  unavailable: 'Backend Unavailable',
};

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  hero: {
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.xl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: t.radius.full,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: t.spacing.md,
  },
  rowValue: { flex: 1, textAlign: 'right', fontFamily: fontFamily.mono },
  details: { gap: t.spacing.sm },
  hint: { marginTop: t.spacing.xs },
}));

/**
 * Temporary development screen: proves the app can reach the FastAPI
 * backend configured for this build. Registered only in development
 * builds (see the navigators); remove once real features cover this.
 */
export function BackendStatusScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { status, url, baseUrl, latencyMs, error, checkedAt, isChecking, refresh } =
    useBackendStatus();

  const tone =
    status === 'connected' ? colors.success : status === 'unavailable' ? colors.error : colors.textMuted;

  return (
    <ScreenContainer edges={['bottom']} scroll testID="backend-status-screen">
      <AppHeader
        title="Backend status"
        subtitle="Development only. Checks GET /api/v1/health."
      />

      <View style={styles.content}>
        <View style={styles.hero} testID="backend-status-hero">
          {isChecking ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={[styles.dot, { backgroundColor: tone }]} />
          )}
          <AppText
            variant="h2"
            align="center"
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            testID="backend-status-label"
            style={{ color: tone }}
          >
            {STATUS_LABEL[status]}
          </AppText>
          {error ? (
            <AppText
              variant="bodySmall"
              color="textSecondary"
              align="center"
              testID="backend-status-error"
            >
              {error}
            </AppText>
          ) : null}
        </View>

        <AppCard variant="filled">
          <View style={styles.details}>
            <Row label="Environment" value={env.APP_ENV} />
            <Row label="API base URL" value={baseUrl} />
            <Row label="Probed" value={url} />
            <Row label="Latency" value={latencyMs === null ? '—' : `${latencyMs} ms`} />
            <Row
              label="Last checked"
              value={checkedAt ? checkedAt.toLocaleTimeString() : '—'}
            />
          </View>
        </AppCard>

        <AppButton
          title="Check again"
          loading={isChecking}
          onPress={refresh}
          testID="backend-status-refresh"
        />

        {status === 'unavailable' ? (
          <AppText variant="caption" color="textMuted" style={styles.hint}>
            On the Android emulator the host machine is 10.0.2.2, not
            localhost. On a physical device use your computer's LAN IP, or run
            `adb reverse tcp:8000 tcp:8000`. Start the backend with
            `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
          </AppText>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      <AppText variant="bodySmall" style={styles.rowValue} selectable>
        {value}
      </AppText>
    </View>
  );
}
