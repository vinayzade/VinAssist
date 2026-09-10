import { useCallback, useState } from 'react';
import { useForm, type FormHelpers } from '@/hooks/useForm';
import {
  useForgotPasswordMutation,
  useLoginMutation,
  useRegisterMutation,
} from '@/services/api/authApi';
import type { ApiQueryError } from '@/services/api/apiError';
import { classifyAuthError, type AuthFailure } from '../services/authErrors';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
} from '../services/authValidation';
import type {
  ForgotPasswordFormValues,
  LoginFormValues,
  RegisterFormValues,
} from '../types';

/**
 * Shared failure handling: classify the API error, push field errors into
 * the form, keep the banner-level failure for the screen to render.
 */
function useAuthFailure(context: Parameters<typeof classifyAuthError>[1]) {
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const handle = useCallback(
    <V extends object>(error: unknown, helpers: FormHelpers<V>) => {
      const classified = classifyAuthError(error as ApiQueryError, context);
      helpers.setFieldErrors(classified.fieldErrors as never);
      setFailure(classified);
    },
    [context],
  );

  const clear = useCallback(() => setFailure(null), []);
  return { failure, handle, clear };
}

/* --------------------------------- Login --------------------------------- */

export function useLoginForm() {
  const [login] = useLoginMutation();
  const { failure, handle, clear } = useAuthFailure('login');

  const form = useForm<LoginFormValues>({
    initialValues: { email: '', password: '' },
    schema: loginSchema,
    onSubmit: async (values, helpers) => {
      clear();
      try {
        await login({
          email: values.email.toLowerCase(),
          password: values.password,
        }).unwrap();
        // Success: the auth slice flips isAuthenticated and RootNavigator
        // swaps to MainNavigator. Nothing to navigate here.
      } catch (error) {
        handle(error, helpers);
      }
    },
  });

  return { ...form, failure, clearFailure: clear };
}

/* -------------------------------- Register ------------------------------- */

export function useRegisterForm() {
  const [register] = useRegisterMutation();
  const { failure, handle, clear } = useAuthFailure('register');

  const form = useForm<RegisterFormValues>({
    initialValues: { name: '', email: '', password: '', confirmPassword: '' },
    schema: registerSchema,
    onSubmit: async (values, helpers) => {
      clear();
      try {
        await register({
          name: values.name,
          email: values.email.toLowerCase(),
          password: values.password,
        }).unwrap();
      } catch (error) {
        handle(error, helpers);
      }
    },
  });

  return { ...form, failure, clearFailure: clear };
}

/* ----------------------------- Forgot password --------------------------- */

export function useForgotPasswordForm(initialEmail = '') {
  const [requestReset] = useForgotPasswordMutation();
  const { failure, handle, clear } = useAuthFailure('forgot-password');
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<ForgotPasswordFormValues>({
    initialValues: { email: initialEmail },
    schema: forgotPasswordSchema,
    onSubmit: async (values, helpers) => {
      clear();
      try {
        await requestReset({ email: values.email.toLowerCase() }).unwrap();
        setSentTo(values.email);
      } catch (error) {
        // A 404 here would leak whether an account exists; treat it as sent.
        const classified = classifyAuthError(
          error as ApiQueryError,
          'forgot-password',
        );
        if (
          classified.kind === 'unknown' &&
          (error as { status?: unknown })?.status === 404
        ) {
          setSentTo(values.email);
          return;
        }
        handle(error, helpers);
      }
    },
  });

  return { ...form, failure, clearFailure: clear, sentTo };
}
