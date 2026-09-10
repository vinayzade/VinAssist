import { isProduction } from '@/config';

// Verbose in development and staging builds; silent in production.
const enabled = __DEV__ || !isProduction;

export const logger = {
  log: (...args: unknown[]) => enabled && console.log('[VinAssist]', ...args),
  warn: (...args: unknown[]) => enabled && console.warn('[VinAssist]', ...args),
  error: (...args: unknown[]) =>
    enabled && console.error('[VinAssist]', ...args),
};
