import React from 'react';
import { View } from 'react-native';
import {
  AppButton,
  AppHeader,
  AppTextInput,
  EmptyState,
  ScreenContainer,
} from '@/components';
import type { AuthScreenProps } from '@/navigation/navigationTypes';
import { createStyles } from '@/theme';
import { FormBanner } from '../components';
import { useForgotPasswordForm } from '../hooks/useAuthForms';

const useStyles = createStyles(t => ({
  form: { gap: t.spacing.md },
  footer: { marginTop: t.spacing.lg, alignItems: 'center' },
}));

export function ForgotPasswordScreen({
  navigation,
  route,
}: AuthScreenProps<'ForgotPassword'>) {
  const styles = useStyles();
  const { field, handleSubmit, isSubmitting, failure, sentTo } =
    useForgotPasswordForm(route.params?.email ?? '');

  if (sentTo) {
    return (
      <ScreenContainer edges={['bottom']}>
        <EmptyState
          icon="✓"
          title="Check your inbox"
          description={`If an account exists for ${sentTo}, we have sent instructions to reset your password.`}
          action={{
            title: 'Back to sign in',
            onPress: () => navigation.popTo('Login'),
          }}
          testID="forgot-password-sent"
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['bottom']} scroll>
      <AppHeader
        title="Forgot password?"
        subtitle="Enter your email and we will send you a reset link."
      />

      <View style={styles.form}>
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
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          testID="forgot-email"
        />
        <AppButton
          title="Send reset link"
          loading={isSubmitting}
          onPress={handleSubmit}
          testID="forgot-submit"
        />
      </View>

      <View style={styles.footer}>
        <AppButton
          variant="link"
          title="Back to sign in"
          disabled={isSubmitting}
          onPress={() => navigation.goBack()}
        />
      </View>
    </ScreenContainer>
  );
}
