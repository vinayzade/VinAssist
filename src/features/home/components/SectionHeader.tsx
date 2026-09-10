import React from 'react';
import { View } from 'react-native';
import { AppButton, AppText } from '@/components';
import { createStyles } from '@/theme';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
}

const useStyles = createStyles(t => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: t.spacing.sm,
  },
}));

/** Section title with an optional trailing link, e.g. "See all". */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
  actionTestID,
}: SectionHeaderProps) {
  const styles = useStyles();

  return (
    <View style={styles.root} accessibilityRole="header">
      <AppText variant="h3">{title}</AppText>
      {actionLabel && onAction ? (
        <AppButton
          title={actionLabel}
          variant="link"
          size="sm"
          onPress={onAction}
          testID={actionTestID}
        />
      ) : null}
    </View>
  );
}
