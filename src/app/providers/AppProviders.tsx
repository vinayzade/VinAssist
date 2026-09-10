import React, { type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as ReduxProvider } from 'react-redux';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { store } from '@/store';
import { registerAppListeners } from '@/store/listeners';
import { ThemeProvider } from '@/theme';

// Side-effect listeners (persistence etc.) must be attached before any action
// is dispatched, so register them at module load rather than in an effect.
registerAppListeners();

/**
 * Composes every app-wide provider in one place. Add new global providers
 * here (i18n, analytics, ...) rather than in App.tsx.
 *
 * Order matters:
 *  - GestureHandlerRootView must be the outermost view so every gesture in
 *    the tree (including navigation gestures) is handled natively.
 *  - ThemeProvider reads the settings slice, so it must sit inside
 *    ReduxProvider.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <ReduxProvider store={store}>
        {/* initialMetrics avoids a blank first frame while insets are measured. */}
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>{children}</ThemeProvider>
        </SafeAreaProvider>
      </ReduxProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
