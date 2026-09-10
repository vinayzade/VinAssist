import { rules, type Schema } from '@/utils/validation';
import type {
  ForgotPasswordFormValues,
  LoginFormValues,
  RegisterFormValues,
} from '../types';

export const NAME_MAX = 60;
export const PASSWORD_MIN = 8;

export const loginSchema: Schema<LoginFormValues> = {
  email: [rules.required('Enter your email'), rules.email()],
  password: [rules.required('Enter your password')],
};

export const registerSchema: Schema<RegisterFormValues> = {
  name: [
    rules.required('Enter your name'),
    rules.minLength(2, 'Name is too short'),
    rules.maxLength(NAME_MAX),
  ],
  email: [rules.required('Enter your email'), rules.email()],
  password: [rules.required('Choose a password'), rules.password()],
  confirmPassword: [
    rules.required('Confirm your password'),
    rules.matches<RegisterFormValues>('password', 'Passwords do not match'),
  ],
};

export const forgotPasswordSchema: Schema<ForgotPasswordFormValues> = {
  email: [rules.required('Enter your email'), rules.email()],
};
