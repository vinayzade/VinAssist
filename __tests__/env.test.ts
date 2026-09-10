import { APP_ENVS, EnvError, assertNoSecrets, env, parseEnv } from '@/config';

describe('env', () => {
  it('loads the development file under Jest', () => {
    expect(env.APP_ENV).toBe('development');
    expect(env.API_BASE_URL).toBe('http://10.0.2.2:8000');
    expect(Object.isFrozen(env)).toBe(true);
  });

  it.each(APP_ENVS)('accepts APP_ENV=%s', appEnv => {
    const parsed = parseEnv({
      APP_ENV: appEnv,
      API_BASE_URL: 'https://api.vinassist.app/',
    });
    expect(parsed.APP_ENV).toBe(appEnv);
    expect(parsed.API_BASE_URL).toBe('https://api.vinassist.app');
  });

  it('rejects a missing or unknown APP_ENV', () => {
    expect(() => parseEnv({ API_BASE_URL: 'https://x.y' })).toThrow(EnvError);
    expect(() =>
      parseEnv({ APP_ENV: 'qa', API_BASE_URL: 'https://x.y' }),
    ).toThrow(/APP_ENV must be one of/);
  });

  it('rejects a bad API_BASE_URL', () => {
    expect(() => parseEnv({ APP_ENV: 'development' })).toThrow(/missing/);
    expect(() =>
      parseEnv({ APP_ENV: 'development', API_BASE_URL: 'not a url' }),
    ).toThrow(/not a valid URL/);
    expect(() =>
      parseEnv({ APP_ENV: 'development', API_BASE_URL: 'ftp://x.y' }),
    ).toThrow(/http\(s\)/);
  });

  it('requires https in production', () => {
    expect(() =>
      parseEnv({
        APP_ENV: 'production',
        API_BASE_URL: 'http://api.vinassist.app',
      }),
    ).toThrow(/https in production/);
  });

  it('refuses to start if an AI provider key is present', () => {
    const base = { APP_ENV: 'development', API_BASE_URL: 'https://x.y' };
    expect(() => parseEnv({ ...base, OPENAI_API_KEY: 'sk-abc' })).toThrow(
      /look like secrets/,
    );
    expect(() => parseEnv({ ...base, HF_TOKEN: 'hf_abc' })).toThrow(EnvError);
    expect(() => parseEnv({ ...base, ANTHROPIC_KEY: 'x' })).toThrow(EnvError);
    // Innocent name, credential-shaped value.
    expect(() => assertNoSecrets({ MODEL: 'sk-ant-abc123' })).toThrow(EnvError);
    // Public values pass.
    expect(() => assertNoSecrets(base)).not.toThrow();
  });
});
