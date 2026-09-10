import Config from 'react-native-config';

/* ------------------------------------------------------------------------ */
/* Types                                                                    */
/* ------------------------------------------------------------------------ */

export const APP_ENVS = ['development', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export interface Env {
  /** Which backend / behaviour profile this build targets. */
  readonly APP_ENV: AppEnv;
  /** Base URL of the VinAssist FastAPI backend, without a trailing slash. */
  readonly API_BASE_URL: string;
}

/** Raw shape as read from the native side; every key may be missing. */
export type RawEnv = Partial<Record<keyof Env, string | undefined>>;

/* ------------------------------------------------------------------------ */
/* Validation                                                               */
/* ------------------------------------------------------------------------ */

export class EnvError extends Error {
  constructor(message: string) {
    super(`[env] ${message}`);
    this.name = 'EnvError';
  }
}

/**
 * Variable names that must never reach the mobile bundle. AI provider keys
 * and any other credential belong in the FastAPI backend only; the app
 * authenticates to *our* API and the backend talks to the providers.
 */
const FORBIDDEN_NAME = /(API_?KEY|SECRET|TOKEN|PASSWORD|PRIVATE|CREDENTIAL)/i;
const FORBIDDEN_PROVIDER =
  /(HUGGING_?FACE|HF_|OPENAI|ANTHROPIC|GEMINI|MISTRAL|COHERE|REPLICATE)/i;

/** Values that look like provider credentials even under an innocent name. */
const FORBIDDEN_VALUE = /^(sk-|hf_|sk-ant-|AIza|xoxb-|ghp_)/;

export function assertNoSecrets(raw: Record<string, string | undefined>) {
  const offenders = Object.entries(raw)
    .filter(
      ([name, value]) =>
        FORBIDDEN_NAME.test(name) ||
        FORBIDDEN_PROVIDER.test(name) ||
        (value !== undefined && FORBIDDEN_VALUE.test(value)),
    )
    .map(([name]) => name);

  if (offenders.length > 0) {
    throw new EnvError(
      `Refusing to start: ${offenders.join(', ')} look like secrets. ` +
        'API keys must live only in the FastAPI backend, never in the app.',
    );
  }
}

function isAppEnv(value: string): value is AppEnv {
  return (APP_ENVS as readonly string[]).includes(value);
}

function parseBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new EnvError(`API_BASE_URL is not a valid URL: "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EnvError(`API_BASE_URL must use http(s): "${value}"`);
  }
  return value.replace(/\/+$/, '');
}

/**
 * Validates a raw config object into a typed `Env`. Throws `EnvError` with a
 * precise message so a misconfigured build fails at startup, not on the
 * first network request.
 */
export function parseEnv(
  raw: RawEnv & Record<string, string | undefined>,
): Env {
  assertNoSecrets(raw);

  const appEnv = raw.APP_ENV?.trim();
  if (!appEnv) {
    throw new EnvError('APP_ENV is missing. Did the .env file load?');
  }
  if (!isAppEnv(appEnv)) {
    throw new EnvError(
      `APP_ENV must be one of ${APP_ENVS.join(', ')}; got "${appEnv}"`,
    );
  }

  const baseUrl = raw.API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new EnvError('API_BASE_URL is missing.');
  }
  const parsedUrl = parseBaseUrl(baseUrl);

  if (appEnv === 'production' && !parsedUrl.startsWith('https://')) {
    throw new EnvError('API_BASE_URL must use https in production.');
  }

  return Object.freeze({ APP_ENV: appEnv, API_BASE_URL: parsedUrl });
}

/* ------------------------------------------------------------------------ */
/* Runtime instance                                                         */
/* ------------------------------------------------------------------------ */

/**
 * The validated environment for this build. Import this everywhere instead
 * of `react-native-config` directly.
 */
export const env: Env = parseEnv(Config);

export const isDevelopment = env.APP_ENV === 'development';
export const isStaging = env.APP_ENV === 'staging';
export const isProduction = env.APP_ENV === 'production';
