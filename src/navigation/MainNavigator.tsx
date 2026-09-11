import React from 'react';
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { isDevelopment } from '@/config';
import { AIAssistantScreen } from '@/features/aiAssistant';
import { BackendStatusScreen } from '@/features/devTools';
import {
  DocumentAnalysisScreen,
  DocumentChatScreen,
} from '@/features/documentAnalysis';
import { HistoryScreen } from '@/features/history';
import { HomeScreen } from '@/features/home';
import { ImageAnalysisScreen } from '@/features/imageAnalysis';
import {
  ImageQualityResultScreen,
  ImageQualityScreen,
} from '@/features/imageQuality';
import { OcrResultScreen, OcrScreen } from '@/features/ocr';
import { ProfileScreen } from '@/features/profile';
import { CameraScreen, ImagePreviewScreen } from '@/features/scanner';
import { SentimentScreen } from '@/features/sentiment';
import { VoiceScreen } from '@/features/voice';
import { useTheme } from '@/theme';
import { TAB_BAR_ICONS } from './components/TabBarIcon';
import type { MainStackParamList, MainTabParamList } from './navigationTypes';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

const TAB_TITLES: Record<keyof MainTabParamList, string> = {
  Home: 'Home',
  AIAssistant: 'Assistant',
  History: 'History',
  Profile: 'Profile',
};

function MainTabs() {
  const { colors } = useTheme();

  const screenOptions = ({
    route,
  }: {
    route: RouteProp<MainTabParamList>;
  }): BottomTabNavigationOptions => ({
    headerShown: false,
    title: TAB_TITLES[route.name],
    tabBarIcon: TAB_BAR_ICONS[route.name],
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: {
      backgroundColor: colors.background,
      borderTopColor: colors.border,
    },
    // Keep tab screens mounted so chat state and scroll positions survive
    // switching tabs.
    lazy: true,
    freezeOnBlur: true,
  });

  return (
    <Tab.Navigator initialRouteName="Home" screenOptions={screenOptions}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="AIAssistant" component={AIAssistantScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

/**
 * Signed-in area: the tab bar plus full-screen tool flows pushed above it.
 * Tools live on the stack (not inside a tab) so the tab bar hides while a
 * tool is open and the user gets a native back gesture.
 */
export function MainNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="Tabs"
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Tabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Scanner"
        component={CameraScreen}
        options={{
          headerShown: false,
          // Full-screen modal camera; content is drawn edge to edge.
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          orientation: 'portrait',
        }}
      />
      <Stack.Screen
        name="ImagePreview"
        component={ImagePreviewScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'fade',
          orientation: 'portrait',
        }}
      />
      <Stack.Screen
        name="OCR"
        component={OcrScreen}
        options={{ title: 'Smart OCR' }}
      />
      <Stack.Screen
        name="OCRResult"
        component={OcrResultScreen}
        options={{ title: 'Extracted text' }}
      />
      <Stack.Screen
        name="DocumentAnalysis"
        component={DocumentAnalysisScreen}
        options={{ title: 'Document Analysis' }}
      />
      <Stack.Screen
        name="DocumentChat"
        component={DocumentChatScreen}
        options={{ title: 'Document chat' }}
      />
      <Stack.Screen
        name="ImageAnalysis"
        component={ImageAnalysisScreen}
        options={{ title: 'Image Analysis' }}
      />
      <Stack.Screen
        name="ImageQuality"
        component={ImageQualityScreen}
        options={{ title: 'Image Quality' }}
      />
      <Stack.Screen
        name="ImageQualityResult"
        component={ImageQualityResultScreen}
        options={{ title: 'Quality report' }}
      />
      <Stack.Screen name="Sentiment" component={SentimentScreen} />
      <Stack.Screen name="Voice" component={VoiceScreen} />
      {isDevelopment ? (
        <Stack.Screen
          name="BackendStatus"
          component={BackendStatusScreen}
          options={{ title: 'Backend status' }}
        />
      ) : null}
    </Stack.Navigator>
  );
}
