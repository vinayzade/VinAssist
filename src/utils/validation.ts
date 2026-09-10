/**
 * Small, dependency-free validation primitives. A rule returns an error
 * message or `undefined`. Rules compose left-to-right and stop at the first
 * failure so the user sees one clear message per field.
 */

export type Rule<T, V extends object = object> = (
  value: T,
  values: V,
) => string | undefined;

export type Schema<V extends object> = {
  [K in keyof V]?: Rule<V[K], V>[];
};

export type Errors<V extends object> = Partial<Record<keyof V, string>>;

const EMAIL_RE =
  // RFC 5322-lite: local@domain.tld with a real TLD. Deliberately not
  // exhaustive; the server is the authority.
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const rules = {
  required:
    (message = 'This field is required'): Rule<unknown> =>
    value =>
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
        ? message
        : undefined,

  email:
    (message = 'Enter a valid email address'): Rule<string> =>
    value =>
      value && !EMAIL_RE.test(value.trim()) ? message : undefined,

  minLength:
    (min: number, message?: string): Rule<string> =>
    value =>
      value && value.length < min
        ? message ?? `Must be at least ${min} characters`
        : undefined,

  maxLength:
    (max: number, message?: string): Rule<string> =>
    value =>
      value && value.length > max
        ? message ?? `Must be at most ${max} characters`
        : undefined,

  pattern:
    (re: RegExp, message: string): Rule<string> =>
    value =>
      value && !re.test(value) ? message : undefined,

  /** Letters and digits both present; the common "strong enough" baseline. */
  password:
    (
      message = 'Use at least 8 characters with a letter and a number',
    ): Rule<string> =>
    value =>
      value &&
      !(value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value))
        ? message
        : undefined,

  matches:
    <V extends object>(
      other: keyof V,
      message = 'Fields do not match',
    ): Rule<string, V> =>
    (value, values) =>
      value && value !== (values[other] as unknown as string)
        ? message
        : undefined,
};

/** Runs a schema against values; returns only the fields that failed. */
export function validate<V extends object>(
  values: V,
  schema: Schema<V>,
): Errors<V> {
  const errors: Errors<V> = {};
  for (const key of Object.keys(schema) as (keyof V)[]) {
    const fieldRules = schema[key];
    if (!fieldRules) {
      continue;
    }
    for (const rule of fieldRules) {
      const message = rule(values[key], values);
      if (message) {
        errors[key] = message;
        break;
      }
    }
  }
  return errors;
}

export function validateField<V extends object, K extends keyof V>(
  key: K,
  values: V,
  schema: Schema<V>,
): string | undefined {
  for (const rule of schema[key] ?? []) {
    const message = rule(values[key], values);
    if (message) {
      return message;
    }
  }
  return undefined;
}
