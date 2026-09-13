import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, View } from 'react-native';
import {
  ActionSheet,
  AppButton,
  AppHeader,
  AppText,
  AppTextInput,
  EmptyState,
  ErrorView,
  PromptDialog,
  ScreenContainer,
} from '@/components';
import { useDebounce } from '@/hooks/useDebounce';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import {
  ACTIVITY_KINDS,
  HISTORY_PAGE_SIZE,
  useClearHistoryMutation,
  useDeleteHistoryItemMutation,
  useListHistoryInfiniteQuery,
  useUpdateHistoryItemMutation,
  type ActivityItem,
  type ActivityKind,
} from '@/services/api';
import { createStyles, useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import { ACTIVITY_META } from '../activityMeta';
import { ActivityCard } from '../components/ActivityCard';

type KindFilter = ActivityKind | 'all';

const useStyles = createStyles(t => ({
  toolbar: { paddingHorizontal: t.layout.screenPadding, gap: t.spacing.sm, paddingBottom: t.spacing.sm },
  chips: { gap: t.spacing.xs, paddingRight: t.spacing.md },
  chip: {
    borderRadius: t.radius.full,
    borderWidth: 1,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: t.layout.screenPadding,
    paddingBottom: t.spacing.lg,
    gap: t.layout.itemGap,
  },
  footer: { paddingVertical: t.spacing.md, alignItems: 'center' },
  count: { paddingHorizontal: t.layout.screenPadding, paddingBottom: t.spacing.xs },
}));

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.primary : colors.surfaceElevated,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      testID={testID}
    >
      <AppText variant="caption" color={active ? 'onPrimary' : 'textSecondary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * The user's AI activity, straight from the server. Pages are fetched as
 * the list is scrolled; search and filters restart from page one.
 */
export function HistoryScreen({ navigation }: MainTabScreenProps<'History'>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [menuFor, setMenuFor] = useState<ActivityItem | null>(null);
  const [renaming, setRenaming] = useState<ActivityItem | null>(null);
  const query = useDebounce(search.trim(), 300);

  const filter = useMemo(
    () => ({
      kinds: kind === 'all' ? undefined : [kind],
      favourite: favouritesOnly || undefined,
      q: query || undefined,
    }),
    [favouritesOnly, kind, query],
  );

  const {
    // `currentData` (not `data`): a new search/filter must not show the old page.
    currentData: data,
    error,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useListHistoryInfiniteQuery(filter);
  const [updateItem, { isLoading: isUpdating }] = useUpdateHistoryItemMutation();
  const [deleteItem, { isLoading: isDeleting }] = useDeleteHistoryItemMutation();
  const [clearAll, { isLoading: isClearing }] = useClearHistoryMutation();

  // Tab screens stay mounted, so pick up new activity whenever the tab is
  // shown again. Refs keep the callback stable; a changing callback would
  // re-run the effect on every data update.
  const hasData = useRef(false);
  hasData.current = Boolean(data);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false; // the query already fetches on mount
        return;
      }
      if (hasData.current) {
        refetch();
      }
    }, [refetch]),
  );

  const items = useMemo(() => data?.pages.flatMap(page => page.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const filtered = kind !== 'all' || favouritesOnly || Boolean(query);
  const busy = isUpdating || isDeleting || isClearing;
  const isLoading = isFetching && !data;

  const toggleFavourite = useCallback(
    async (item: ActivityItem) => {
      try {
        await updateItem({ id: item.id, favourite: !item.favourite }).unwrap();
      } catch (err) {
        logger.warn('[history] favourite failed', err);
        Alert.alert('Could not update', 'Please try again.');
      }
    },
    [updateItem],
  );

  const rename = useCallback(
    async (item: ActivityItem, title: string) => {
      setRenaming(null);
      try {
        await updateItem({ id: item.id, title }).unwrap();
      } catch (err) {
        logger.warn('[history] rename failed', err);
        Alert.alert('Could not rename', 'Please try again.');
      }
    },
    [updateItem],
  );

  const confirmDelete = useCallback(
    (item: ActivityItem) => {
      Alert.alert('Delete this item?', 'The saved result is removed as well.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteItem(item.id)
              .unwrap()
              .catch(err => {
                logger.warn('[history] delete failed', err);
                Alert.alert('Could not delete', 'Please try again.');
              }),
        },
      ]);
    },
    [deleteItem],
  );

  const confirmClear = useCallback(() => {
    Alert.alert('Clear all history?', 'Every saved result and conversation will be deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => clearAll().unwrap().catch(() => undefined) },
    ]);
  }, [clearAll]);

  const open = useCallback(
    (item: ActivityItem) => {
      if (item.kind === 'conversation' && item.refId) {
        navigation.navigate('AIAssistant', { resume: item.refId });
      }
    },
    [navigation],
  );

  const renderRow = useCallback(
    ({ item }: { item: ActivityItem }) => (
      <ActivityCard
        item={item}
        onToggleFavourite={toggleFavourite}
        onMenu={setMenuFor}
        onOpen={open}
        busy={busy}
      />
    ),
    [busy, open, toggleFavourite],
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <ScreenContainer edges={['top']} noPadding testID="history-screen">
      <AppHeader
        title="History"
        right={
          items.length > 0 ? (
            <AppButton
              title="Clear"
              variant="link"
              size="sm"
              fullWidth={false}
              disabled={busy}
              onPress={confirmClear}
              testID="history-clear"
            />
          ) : undefined
        }
      />

      <View style={styles.toolbar}>
        <AppTextInput
          placeholder="Search your activity…"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
          testID="history-search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" active={kind === 'all'} onPress={() => setKind('all')} testID="history-kind-all" />
          <Chip
            label={favouritesOnly ? '★ Favourites' : '☆ Favourites'}
            active={favouritesOnly}
            onPress={() => setFavouritesOnly(v => !v)}
            testID="history-favourites"
          />
          {ACTIVITY_KINDS.map(k => (
            <Chip
              key={k}
              label={ACTIVITY_META[k].chip}
              active={kind === k}
              onPress={() => setKind(current => (current === k ? 'all' : k))}
              testID={`history-kind-${k}`}
            />
          ))}
        </ScrollView>
      </View>

      {data ? (
        <View style={styles.count}>
          <AppText variant="caption" color="textMuted" testID="history-count">
            {total === 0
              ? 'Nothing here'
              : `Showing ${items.length} of ${total}${filtered ? ' matching' : ''}`}
          </AppText>
        </View>
      ) : null}

      {error && !data ? (
        <ErrorView error={error} onRetry={refetch} testID="history-error" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={HISTORY_PAGE_SIZE}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshing={isFetching && !isFetchingNextPage && Boolean(data)}
          onRefresh={refetch}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.footer} testID="history-loading">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <EmptyState
                icon="◷"
                title={filtered ? 'No matching activity' : 'No activity yet'}
                description={
                  filtered
                    ? 'Try a different search or filter.'
                    : 'Results from Smart OCR, image checks, sentiment, document analysis and the assistant will appear here.'
                }
                testID="history-empty"
              />
            )
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footer} testID="history-loading-more">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : hasNextPage ? (
              <View style={styles.footer}>
                <AppButton
                  title="Load more"
                  variant="link"
                  size="sm"
                  fullWidth={false}
                  onPress={loadMore}
                  testID="history-load-more"
                />
              </View>
            ) : undefined
          }
        />
      )}

      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.title}
        onClose={() => setMenuFor(null)}
        testID="history-actions"
        actions={
          menuFor
            ? [
                ...(menuFor.kind === 'conversation' && menuFor.refId
                  ? [{ key: 'open', label: 'Open conversation', glyph: '✦', onPress: () => open(menuFor) }]
                  : []),
                {
                  key: 'favourite',
                  label: menuFor.favourite ? 'Remove from favourites' : 'Add to favourites',
                  glyph: menuFor.favourite ? '☆' : '★',
                  onPress: () => toggleFavourite(menuFor),
                },
                { key: 'rename', label: 'Rename', glyph: '✎', onPress: () => setRenaming(menuFor) },
                {
                  key: 'delete',
                  label: 'Delete',
                  glyph: '×',
                  destructive: true,
                  onPress: () => confirmDelete(menuFor),
                },
              ]
            : []
        }
      />

      <PromptDialog
        visible={renaming !== null}
        title="Rename"
        initialValue={renaming?.title ?? ''}
        placeholder="Name"
        onConfirm={title => renaming && rename(renaming, title)}
        onClose={() => setRenaming(null)}
        testID="history-rename"
      />
    </ScreenContainer>
  );
}
