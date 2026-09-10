import React from 'react';
import { StatusBar } from 'react-native';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useTheme } from '@/theme';
import { AppProviders } from './providers/AppProviders';

function AppContent() {
  const { isDark } = useTheme();

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}
