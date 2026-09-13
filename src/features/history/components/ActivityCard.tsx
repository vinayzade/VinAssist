import React, { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppCard, AppText } from '@/components';
import type { ActivityItem } from '@/services/api';
import { createStyles, useTheme } from '@/theme';
import { ACTIVITY_META, formatRelativeTime } from '../activityMeta';

export interface ActivityCardProps {
  item: ActivityItem;
  onToggleFavourite: (item: ActivityItem) => void;
  onMenu: (item: ActivityItem) => void;
  /** Tapping opens the item where it makes sense (a conversation); otherwise expands it. */
  onOpen?: (item: ActivityItem) => void;
  busy?: boolean;
}

const useStyles = createStyles(t => ({
  row: { flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' },
  badge: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: t.spacing.xxs },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  title: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: {
    width: t.layout.touchTarget - t.spacing.xs,
    height: t.layout.touchTarget - t.spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.full,
  },
}));

/**
 * One history entry with its star and overflow menu. Memoised so typing in
 * the search box (which re-renders the screen on every keystroke) does not
 * re-render every loaded row.
 */
export const ActivityCard = memo(function ActivityCardBase({
  item,
  onToggleFavourite,
  onMenu,
  onOpen,
  busy,
}: ActivityCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const meta = ACTIVITY_META[item.kind];
  const openable = item.kind === 'conversation' && Boolean(item.refId) && Boolean(onOpen);

  return (
    <AppCard
      variant="outlined"
      padding="sm"
      onPress={() => (openable ? onOpen?.(item) : setExpanded(v => !v))}
      onLongPress={() => onMenu(item)}
      accessibilityLabel={`${meta.label}: ${item.title}`}
      testID={`history-item-${item.id}`}
    >
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
          <AppText variant="title" color="onPrimarySoft">
            {meta.glyph}
          </AppText>
        </View>
        <View style={styles.body}>
          <View style={styles.head}>
            <AppText variant="label" numberOfLines={1} style={styles.title} testID={`history-title-${item.id}`}>
              {item.title}
            </AppText>
          </View>
          {item.preview ? (
            <AppText
              variant="bodySmall"
              color="textSecondary"
              numberOfLines={expanded ? undefined : 2}
              testID={`history-preview-${item.id}`}
            >
              {item.preview}
            </AppText>
          ) : null}
          <AppText variant="caption" color="textMuted">
            {meta.label} · {formatRelativeTime(item.lastActivityAt)}
            {openable ? ' · tap to open' : ''}
          </AppText>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => onToggleFavourite(item)}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={item.favourite ? 'Remove from favourites' : 'Add to favourites'}
            accessibilityState={{ selected: item.favourite, disabled: Boolean(busy) }}
            style={styles.iconButton}
            testID={`history-star-${item.id}`}
          >
            <AppText variant="title" color={item.favourite ? 'warning' : 'iconMuted'}>
              {item.favourite ? '★' : '☆'}
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => onMenu(item)}
            disabled={busy}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="More actions"
            style={styles.iconButton}
            testID={`history-menu-${item.id}`}
          >
            <AppText variant="title" color="iconMuted">
              ⋯
            </AppText>
          </Pressable>
        </View>
      </View>
    </AppCard>
  );
});
