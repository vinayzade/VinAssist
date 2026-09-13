import { useCallback } from 'react';
import type { ActivityItem } from '@/services/api';
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
    (item: ActivityItem) => {
      if (item.kind === 'conversation' && item.refId) {
        // Reopen the saved conversation rather than a blank assistant.
        navigation.navigate('AIAssistant', { resume: item.refId });
        return;
      }
      go(ACTIVITY_KINDS[item.kind].route);
    },
    [go, navigation],
  );

  const openHistory = useCallback(
    () => navigation.navigate('History'),
    [navigation],
  );

  return { openAction, openActivity, openHistory };
}
