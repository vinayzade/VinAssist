import React, { useRef } from 'react';
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
import { useRegisterForm } from '../hooks/useAuthForms';
import { PASSWORD_MIN } from '../services/authValidation';

const useStyles = createStyles(t => ({
  form: { gap: t.spacing.md },
}));

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
  const styles = useStyles();
  const { field, handleSubmit, isSubmitting, failure } = useRegisterForm();
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  return (
    <ScreenContainer scroll>
      <AppHeader title="Create account" subtitle="Get started with VinAssist" />

      <View style={styles.form}>
        {failure ? (
          <FormBanner
            message={failure.message}
            actionLabel={
              failure.kind === 'email-taken'
                ? 'Sign in'
                : failure.retryable
                ? 'Try again'
                : undefined
            }
            onAction={
              failure.kind === 'email-taken'
                ? () => navigation.popTo('Login')
                : failure.retryable
                ? handleSubmit
                : undefined
            }
          />
        ) : null}

        <AppTextInput
          {...field('name')}
          label="Name"
          placeholder="Your name"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          testID="register-name"
        />
        <AppTextInput
          {...field('email')}
          ref={emailRef}
          label="Email"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          testID="register-email"
        />
        <PasswordField
          {...field('password')}
          ref={passwordRef}
          label="Password"
          placeholder={`At least ${PASSWORD_MIN} characters`}
          helperText="Use a mix of letters and numbers."
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          testID="register-password"
        />
        <PasswordField
          {...field('confirmPassword')}
          ref={confirmRef}
          label="Confirm password"
          placeholder="Repeat your password"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          testID="register-confirm"
        />

        <AppButton
          title="Create account"
          loading={isSubmitting}
          onPress={handleSubmit}
          testID="register-submit"
        />
      </View>

      <AuthFooterLink
        prompt="Already have an account?"
        linkLabel="Sign in"
        disabled={isSubmitting}
        onPress={() => navigation.popTo('Login')}
      />
    </ScreenContainer>
  );
}
