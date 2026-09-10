import React from 'react';
import { FlatList, View } from 'react-native';
import {
  AppCard,
  AppHeader,
  AppText,
  EmptyState,
  ScreenContainer,
} from '@/components';
import { useAppSelector } from '@/store/hooks';
import { createStyles } from '@/theme';
import type { HistoryItem } from '../types';

const useStyles = createStyles(t => ({
  list: {
    flexGrow: 1,
    paddingHorizontal: t.layout.screenPadding,
    paddingBottom: t.spacing.lg,
  },
  separator: { height: t.layout.itemGap },
  meta: { marginBottom: t.spacing.xs },
}));

function Separator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

export function HistoryScreen() {
  const styles = useStyles();
  const items = useAppSelector(state => state.history.items);

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <AppCard>
      <AppText variant="caption" color="textMuted" style={styles.meta}>
        {item.kind} · {new Date(item.createdAt).toLocaleString()}
      </AppText>
      <AppText variant="title">{item.title}</AppText>
      <AppText color="textSecondary">{item.summary}</AppText>
    </AppCard>
  );

  return (
    <ScreenContainer edges={['top']} noPadding>
      <AppHeader title="History" />
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No activity yet"
            description="Results from the assistant and tools will appear here."
          />
        }
      />
    </ScreenContainer>
  );
}
