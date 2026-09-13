import React from 'react';
import { View } from 'react-native';
import { AppCard, AppText } from '@/components';
import type { ActivityItem } from '@/services/api';
import { createStyles } from '@/theme';
import { ACTIVITY_KINDS } from '../constants/dashboard';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { GlyphBadge } from './GlyphBadge';

interface ActivityCardProps {
  item: ActivityItem;
  onPress: (item: ActivityItem) => void;
}

const useStyles = createStyles(t => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  text: { flex: 1, gap: t.spacing.xxs },
  meta: { flexDirection: 'row', gap: t.spacing.xs },
}));

/** Compact row for a recent history item. */
export function ActivityCard({ item, onPress }: ActivityCardProps) {
  const styles = useStyles();
  const kind = ACTIVITY_KINDS[item.kind];

  return (
    <AppCard
      variant="filled"
      padding="sm"
      onPress={() => onPress(item)}
      accessibilityLabel={`${kind.label}: ${item.title}`}
      testID={`activity-${item.id}`}
    >
      <View style={styles.row}>
        <GlyphBadge glyph={kind.glyph} />
        <View style={styles.text}>
          <AppText variant="label" numberOfLines={1}>
            {item.title}
          </AppText>
          <View style={styles.meta}>
            <AppText variant="caption" color="textMuted">
              {kind.label}
            </AppText>
            <AppText variant="caption" color="textMuted">
              ·
            </AppText>
            <AppText variant="caption" color="textMuted">
              {formatRelativeTime(item.lastActivityAt)}
            </AppText>
          </View>
        </View>
      </View>
    </AppCard>
  );
}
