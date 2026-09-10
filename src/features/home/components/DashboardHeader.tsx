import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components';
import { createStyles } from '@/theme';

interface DashboardHeaderProps {
  name: string | null | undefined;
}

const useStyles = createStyles(t => ({
  root: { paddingTop: t.spacing.sm, gap: t.spacing.xxs },
}));

/** Greeting block at the top of the dashboard. */
export function DashboardHeader({ name }: DashboardHeaderProps) {
  const styles = useStyles();
  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <View style={styles.root}>
      <AppText variant="overline" color="primary">
        AI SmartAssist
      </AppText>
      <AppText variant="h1" testID="dashboard-greeting">
        Hello, {firstName || 'there'}
      </AppText>
      <AppText color="textSecondary">
        What would you like AI to help with?
      </AppText>
    </View>
  );
}
