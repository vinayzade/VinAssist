import React, { useMemo } from 'react';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppBootstrap } from '@/app/hooks/useAppBootstrap';
import { SplashScreen } from '@/features/auth';
import { selectIsAuthenticated } from '@/features/auth';
import { useAppSelector } from '@/store/hooks';
import { useTheme } from '@/theme';
import { AuthNavigator } from './AuthNavigator';
import { linking } from './linking';
import { MainNavigator } from './MainNavigator';
import { navigationRef } from './navigationRef';
import type { RootStackParamList } from './navigationTypes';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root of the navigation tree.
 *
 *   Splash ──▶ check persisted session ──▶ Auth (signed out)
 *                                       └─▶ Main (signed in)
 *
 * The three branches are mutually exclusive routes, so the auth switch is
 * driven purely by state: signing in or out swaps the mounted navigator and
 * React Navigation resets the stack. No manual `navigate('Main')` calls.
 */
export function RootNavigator() {
  const { isReady } = useAppBootstrap();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { isDark, colors } = useTheme();

  const navigationTheme = useMemo<NavigationTheme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
        notification: colors.error,
      },
    };
  }, [isDark, colors]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      linking={linking}
      // With `linking` set, the container waits for the initial URL before
      // mounting the navigator. Show the splash meanwhile, not a blank frame.
      fallback={<SplashScreen />}
    >
      <Stack.Navigator
        screenOptions={{ headerShown: false, animation: 'fade' }}
      >
        {!isReady ? (
          <Stack.Screen name="Splash" component={SplashScreen} />
        ) : isAuthenticated ? (
          <Stack.Screen name="Main" component={MainNavigator} />
        ) : (
          <Stack.Screen
            name="Auth"
            component={AuthNavigator}
            // Slide the auth flow in from the left when signing out, so it
            // reads as "going back" rather than pushing a new screen.
            options={{ animationTypeForReplace: 'pop' }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
