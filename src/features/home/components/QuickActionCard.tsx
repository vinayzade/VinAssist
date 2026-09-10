import React from 'react';
import { View } from 'react-native';
import { AppCard, AppText } from '@/components';
import { createStyles } from '@/theme';
import type { DashboardAction } from '../types';
import { GlyphBadge } from './GlyphBadge';

interface QuickActionCardProps {
  action: DashboardAction;
  onPress: (action: DashboardAction) => void;
}

const useStyles = createStyles(t => ({
  card: { flex: 1, minHeight: 124 },
  content: { flex: 1, justifyContent: 'space-between', gap: t.spacing.sm },
}));

/** Large tappable tile for the quick-actions grid. */
export function QuickActionCard({ action, onPress }: QuickActionCardProps) {
  const styles = useStyles();

  return (
    <AppCard
      style={styles.card}
      onPress={() => onPress(action)}
      accessibilityLabel={action.title}
      testID={`quick-action-${action.id}`}
    >
      <View style={styles.content}>
        <GlyphBadge glyph={action.glyph} tone={action.tone} size="lg" />
        <AppText variant="title" numberOfLines={2}>
          {action.title}
        </AppText>
      </View>
    </AppCard>
  );
}
