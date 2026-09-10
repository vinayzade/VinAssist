import { useCallback } from 'react';
import type { HistoryItem } from '@/features/history/types';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import { ACTIVITY_KINDS } from '../constants/dashboard';
import type { DashboardAction, DashboardRoute } from '../types';

type HomeNavigation = MainTabScreenProps<'Home'>['navigation'];

/**
 * Turns dashboard intents into navigation calls. Cards only know a
 * `DashboardRoute`; this hook knows whether that is a tab or a stack screen.
 */
export function useDashboardNavigation(navigation: HomeNavigation) {
  const go = useCallback(
    (route: DashboardRoute) => {
      // The composite navigation prop resolves both sibling tabs and
      // parent-stack tool screens, so one call covers every route.
      navigation.navigate(route);
    },
    [navigation],
  );

  const openAction = useCallback(
    (action: DashboardAction) => go(action.route),
    [go],
  );

  const openActivity = useCallback(
    (item: HistoryItem) => go(ACTIVITY_KINDS[item.kind].route),
    [go],
  );

  const openHistory = useCallback(
    () => navigation.navigate('History'),
    [navigation],
  );

  return { openAction, openActivity, openHistory };
}
