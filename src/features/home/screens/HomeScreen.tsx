import React, { useCallback } from 'react';
import { FlatList, View, type ListRenderItem } from 'react-native';
import { EmptyState, ScreenContainer } from '@/components';
import { useAuth } from '@/features/auth';
import { selectRecentHistory } from '@/features/history';
import type { HistoryItem } from '@/features/history/types';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import { useAppSelector } from '@/store/hooks';
import { createStyles } from '@/theme';
import {
  ActivityCard,
  DashboardHeader,
  QuickActionCard,
  SectionHeader,
  ToolCard,
} from '../components';
import {
  AI_TOOLS,
  QUICK_ACTIONS,
  RECENT_ACTIVITY_LIMIT,
} from '../constants/dashboard';
import { useDashboardNavigation } from '../hooks/useDashboardNavigation';
import type { DashboardAction } from '../types';

const useStyles = createStyles(t => ({
  list: {
    paddingHorizontal: t.layout.screenPadding,
    paddingBottom: t.spacing.xl,
  },
  header: { gap: t.layout.sectionGap, marginBottom: t.spacing.sm },
  gridRow: { gap: t.layout.itemGap },
  itemSeparator: { height: t.layout.itemGap },
}));

const keyById = (item: { id: string }) => item.id;

/**
 * AI SmartAssist dashboard. One virtualised list drives the whole screen:
 * the recent-activity rows are the list data, and the greeting, quick
 * actions and tools live in the header so everything scrolls together.
 * Nested FlatLists are non-scrolling and share the outer virtualisation.
 */
export function HomeScreen({ navigation }: MainTabScreenProps<'Home'>) {
  const styles = useStyles();
  const { user } = useAuth();
  const recent = useAppSelector(state =>
    selectRecentHistory(state, RECENT_ACTIVITY_LIMIT),
  );
  const { openAction, openActivity, openHistory } =
    useDashboardNavigation(navigation);

  const renderQuickAction: ListRenderItem<DashboardAction> = useCallback(
    ({ item }) => <QuickActionCard action={item} onPress={openAction} />,
    [openAction],
  );

  const renderTool: ListRenderItem<DashboardAction> = useCallback(
    ({ item }) => <ToolCard tool={item} onPress={openAction} />,
    [openAction],
  );

  const renderActivity: ListRenderItem<HistoryItem> = useCallback(
    ({ item }) => <ActivityCard item={item} onPress={openActivity} />,
    [openActivity],
  );

  const ItemSeparator = useCallback(
    () => <View style={styles.itemSeparator} />,
    [styles.itemSeparator],
  );

  const header = (
    <View style={styles.header}>
      <DashboardHeader name={user?.name} />

      <View>
        <SectionHeader title="Quick Actions" />
        <FlatList
          data={QUICK_ACTIONS}
          keyExtractor={keyById}
          renderItem={renderQuickAction}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          ItemSeparatorComponent={ItemSeparator}
          scrollEnabled={false}
          testID="quick-actions"
        />
      </View>

      <View>
        <SectionHeader title="AI Tools" />
        <FlatList
          data={AI_TOOLS}
          keyExtractor={keyById}
          renderItem={renderTool}
          ItemSeparatorComponent={ItemSeparator}
          scrollEnabled={false}
          testID="ai-tools"
        />
      </View>

      <SectionHeader
        title="Recent Activity"
        actionLabel={recent.length > 0 ? 'See all' : undefined}
        onAction={recent.length > 0 ? openHistory : undefined}
        actionTestID="see-all-activity"
      />
    </View>
  );

  return (
    <ScreenContainer edges={['top']} noPadding>
      <FlatList
        data={recent}
        keyExtractor={keyById}
        renderItem={renderActivity}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            fullscreen={false}
            icon="◷"
            title="No activity yet"
            description="Results from your tools and conversations will show up here."
          />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        testID="dashboard"
      />
    </ScreenContainer>
  );
}
