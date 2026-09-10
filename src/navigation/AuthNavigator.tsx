import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  ForgotPasswordScreen,
  LoginScreen,
  RegisterScreen,
} from '@/features/auth';
import { useTheme } from '@/theme';
import type { AuthStackParamList } from './navigationTypes';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ headerShown: true, title: 'Reset password' }}
      />
    </Stack.Navigator>
  );
}
