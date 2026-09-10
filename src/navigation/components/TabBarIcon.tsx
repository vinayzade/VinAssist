import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigationTypes';

/**
 * Lightweight glyph icons so the tab bar is usable without an icon font.
 * Swap the glyphs for `react-native-vector-icons` (or similar) later without
 * touching the navigator.
 */
const GLYPHS: Record<keyof MainTabParamList, string> = {
  Home: '⌂',
  AIAssistant: '✦',
  History: '◷',
  Profile: '◯',
};

interface TabBarIconProps {
  route: keyof MainTabParamList;
  color: string;
  size: number;
}

export function TabBarIcon({ route, color, size }: TabBarIconProps) {
  return (
    <Text
      style={[styles.glyph, { color, fontSize: size, lineHeight: size + 4 }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {GLYPHS[route]}
    </Text>
  );
}

type TabBarIconRenderer = NonNullable<BottomTabNavigationOptions['tabBarIcon']>;

/**
 * One stable renderer per tab, created once at module load. Passing these to
 * `tabBarIcon` (instead of an inline arrow) keeps the icon's identity stable
 * across re-renders of the navigator.
 */
export const TAB_BAR_ICONS: Record<keyof MainTabParamList, TabBarIconRenderer> =
  {
    Home: ({ color, size }) => (
      <TabBarIcon route="Home" color={color} size={size} />
    ),
    AIAssistant: ({ color, size }) => (
      <TabBarIcon route="AIAssistant" color={color} size={size} />
    ),
    History: ({ color, size }) => (
      <TabBarIcon route="History" color={color} size={size} />
    ),
    Profile: ({ color, size }) => (
      <TabBarIcon route="Profile" color={color} size={size} />
    ),
  };

const styles = StyleSheet.create({
  glyph: { textAlign: 'center' },
});
