import React, { useEffect, useRef } from 'react';
import { View, type TextInputInstance } from 'react-native';
import {
  AppButton,
  AppHeader,
  AppTextInput,
  ScreenContainer,
} from '@/components';
import type { AuthScreenProps } from '@/navigation/navigationTypes';
import { createStyles } from '@/theme';
import { AuthFooterLink, FormBanner, PasswordField } from '../components';
import { useAuth } from '../hooks/useAuth';
import { useLoginForm } from '../hooks/useAuthForms';

const useStyles = createStyles(t => ({
  form: { gap: t.spacing.md },
  footer: { marginTop: t.spacing.sm, alignItems: 'center' },
}));

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const styles = useStyles();
  const { signOutReason, acknowledgeSignOutReason } = useAuth();
  const { field, values, handleSubmit, isSubmitting, failure, clearFailure } =
    useLoginForm();
  const passwordRef = useRef<TextInputInstance>(null);

  // Show the "session expired" notice once, then forget it.
  const showExpired = signOutReason === 'expired';
  useEffect(
    () => () => {
      acknowledgeSignOutReason();
    },
    [acknowledgeSignOutReason],
  );

  return (
    <ScreenContainer scroll>
      <AppHeader title="Welcome back" subtitle="Sign in to continue" />

      <View style={styles.form}>
        {showExpired && !failure ? (
          <FormBanner
            tone="info"
            message="Your session expired. Please sign in again."
            testID="session-expired-banner"
          />
        ) : null}
        {failure ? (
          <FormBanner
            message={failure.message}
            actionLabel={failure.retryable ? 'Try again' : undefined}
            onAction={failure.retryable ? handleSubmit : undefined}
          />
        ) : null}

        <AppTextInput
          {...field('email')}
          label="Email"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="login-email"
        />
        <PasswordField
          {...field('password')}
          ref={passwordRef}
          label="Password"
          placeholder="Your password"
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          testID="login-password"
        />

        <AppButton
          title="Sign in"
          loading={isSubmitting}
          onPress={handleSubmit}
          testID="login-submit"
        />

        <View style={styles.footer}>
          <AppButton
            variant="link"
            title="Forgot password?"
            disabled={isSubmitting}
            onPress={() => {
              clearFailure();
              navigation.navigate('ForgotPassword', {
                email: values.email.trim() || undefined,
              });
            }}
          />
        </View>
      </View>

      <AuthFooterLink
        prompt="Don't have an account?"
        linkLabel="Register"
        disabled={isSubmitting}
        onPress={() => navigation.navigate('Register')}
      />
    </ScreenContainer>
  );
}
