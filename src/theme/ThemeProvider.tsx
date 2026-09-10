import React, {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { selectThemeMode } from '@/features/settings/store/settingsSlice';
import { useAppSelector } from '@/store/hooks';
import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import type { Theme } from './theme';

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps extends PropsWithChildren {
  /** Force a theme (used by tests and previews). Defaults to user settings. */
  theme?: Theme;
}

/**
 * Resolves the active theme from the user's `settings.themeMode` preference,
 * falling back to the OS colour scheme when the mode is `system`.
 * Must be rendered inside the Redux Provider.
 */
export function ThemeProvider({ children, theme }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const themeMode = useAppSelector(selectThemeMode);
  const isDark =
    themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  const resolved = theme ?? (isDark ? darkTheme : lightTheme);

  return (
    <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return theme;
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Builds a memoised `useStyles()` hook from a theme-aware factory, so
 * components can keep `StyleSheet.create` semantics without inline style
 * objects or hard-coded tokens:
 *
 *   const useStyles = createStyles(t => ({
 *     card: { padding: t.spacing.md, backgroundColor: t.colors.surface },
 *   }));
 *   const styles = useStyles();
 */
export function createStyles<T extends NamedStyles<T> | NamedStyles<unknown>>(
  factory: (theme: Theme) => T & NamedStyles<T>,
) {
  const cache = new WeakMap<Theme, T>();

  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => {
      const cached = cache.get(theme);
      if (cached) {
        return cached;
      }
      const created = StyleSheet.create(factory(theme));
      cache.set(theme, created);
      return created;
    }, [theme]);
  };
}
