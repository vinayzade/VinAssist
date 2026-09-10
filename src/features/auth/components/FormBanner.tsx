import React from 'react';
import { View } from 'react-native';
import { AppButton, AppText } from '@/components';
import { createStyles } from '@/theme';

export interface FormBannerProps {
  message: string;
  tone?: 'error' | 'info' | 'success';
  /** Shown as an inline action, e.g. "Try again" for network failures. */
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

const useStyles = createStyles(t => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.md,
    borderWidth: 1,
  },
  error: { backgroundColor: t.colors.errorSoft, borderColor: t.colors.error },
  info: { backgroundColor: t.colors.infoSoft, borderColor: t.colors.info },
  success: {
    backgroundColor: t.colors.successSoft,
    borderColor: t.colors.success,
  },
  text: { flex: 1 },
}));

/** Form-level message for failures that do not belong to a single field. */
export function FormBanner({
  message,
  tone = 'error',
  actionLabel,
  onAction,
  testID = 'form-banner',
}: FormBannerProps) {
  const styles = useStyles();

  return (
    <View
      style={[styles.root, styles[tone]]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      testID={testID}
    >
      <AppText variant="bodySmall" color={tone} style={styles.text}>
        {message}
      </AppText>
      {actionLabel && onAction ? (
        <AppButton
          title={actionLabel}
          variant="link"
          size="sm"
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}
