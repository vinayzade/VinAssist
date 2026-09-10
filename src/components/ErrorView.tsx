import React from 'react';
import {
  getApiErrorMessage,
  type ApiQueryError,
} from '@/services/api/apiError';
import {
  StatePlaceholder,
  type StatePlaceholderProps,
} from './StatePlaceholder';

export interface ErrorViewProps
  extends Omit<
    StatePlaceholderProps,
    'tone' | 'title' | 'description' | 'action'
  > {
  title?: string;
  /** Explicit message. Takes precedence over `error`. */
  message?: string;
  /** An RTK Query / thrown error; converted to a user-facing message. */
  error?: ApiQueryError | Error | unknown;
  onRetry?: () => void;
  retryTitle?: string;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return getApiErrorMessage(error as ApiQueryError | undefined);
}

export function ErrorView({
  title = 'Something went wrong',
  message,
  error,
  onRetry,
  retryTitle = 'Try again',
  icon = '!',
  testID = 'error-view',
  ...rest
}: ErrorViewProps) {
  return (
    <StatePlaceholder
      tone="error"
      icon={icon}
      title={title}
      description={
        message ?? (error !== undefined ? messageFrom(error) : undefined)
      }
      action={onRetry ? { title: retryTitle, onPress: onRetry } : undefined}
      testID={testID}
      {...rest}
    />
  );
}
