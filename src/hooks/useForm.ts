import { useCallback, useMemo, useRef, useState } from 'react';
import {
  validate,
  validateField,
  type Errors,
  type Schema,
} from '@/utils/validation';

export interface UseFormOptions<V extends object> {
  initialValues: V;
  schema: Schema<V>;
  /**
   * Called with validated values. Throw or return a rejected promise to keep
   * the form in an error state; return normally to mark it submitted.
   */
  onSubmit: (values: V, helpers: FormHelpers<V>) => Promise<void> | void;
  /** Trim string values before validation and submit. Defaults to true. */
  trim?: boolean;
}

export interface FormHelpers<V extends object> {
  /** Attach server-side errors to fields (e.g. from a 422 response). */
  setFieldErrors: (errors: Errors<V>) => void;
  /** Non-field error shown at the top of the form. */
  setFormError: (message: string | null) => void;
  reset: () => void;
}

export interface FieldProps<T> {
  value: T;
  onChangeText: (value: T) => void;
  onBlur: () => void;
  errorText: string | undefined;
  editable: boolean;
}

/**
 * Minimal, typed form controller. Validates on blur (once a field has been
 * touched) and on submit; clears a field's error as soon as the user edits
 * it so feedback never lags behind their input.
 */
export function useForm<V extends object>({
  initialValues,
  schema,
  onSubmit,
  trim = true,
}: UseFormOptions<V>) {
  const [values, setValues] = useState<V>(initialValues);
  const [errors, setErrors] = useState<Errors<V>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof V, boolean>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const latest = useRef(values);
  latest.current = values;

  const normalise = useCallback(
    (v: V): V =>
      trim
        ? (Object.fromEntries(
            Object.entries(v).map(([k, val]) => [
              k,
              typeof val === 'string' ? val.trim() : val,
            ]),
          ) as V)
        : v,
    [trim],
  );

  const setFieldValue = useCallback(
    <K extends keyof V>(key: K, value: V[K]) => {
      setValues(prev => ({ ...prev, [key]: value }));
      setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
      setFormError(null);
    },
    [],
  );

  const blurField = useCallback(
    (key: keyof V) => {
      setTouched(prev => ({ ...prev, [key]: true }));
      const message = validateField(key, normalise(latest.current), schema);
      setErrors(prev => ({ ...prev, [key]: message }));
    },
    [normalise, schema],
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setFormError(null);
    setSubmitCount(0);
  }, [initialValues]);

  const helpers = useMemo<FormHelpers<V>>(
    () => ({
      setFieldErrors: serverErrors =>
        setErrors(prev => ({ ...prev, ...serverErrors })),
      setFormError,
      reset,
    }),
    [reset],
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    const clean = normalise(latest.current);
    const validationErrors = validate(clean, schema);
    setSubmitCount(c => c + 1);
    setTouched(
      Object.fromEntries(Object.keys(clean).map(k => [k, true])) as Partial<
        Record<keyof V, boolean>
      >,
    );
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit(clean, helpers);
    } finally {
      setSubmitting(false);
    }
  }, [helpers, isSubmitting, normalise, onSubmit, schema]);

  /** Everything an `AppTextInput` needs, in one spread. */
  const field = useCallback(
    <K extends keyof V>(key: K): FieldProps<V[K]> => ({
      value: values[key],
      onChangeText: (value: V[K]) => setFieldValue(key, value),
      onBlur: () => blurField(key),
      errorText: touched[key] || submitCount > 0 ? errors[key] : undefined,
      editable: !isSubmitting,
    }),
    [
      blurField,
      errors,
      isSubmitting,
      setFieldValue,
      submitCount,
      touched,
      values,
    ],
  );

  const hasErrors = Object.values(errors).some(Boolean);

  return {
    values,
    errors,
    touched,
    formError,
    isSubmitting,
    submitCount,
    /** False once validation has run and found problems. */
    isValid: !hasErrors,
    field,
    setFieldValue,
    setFormError,
    setFieldErrors: helpers.setFieldErrors,
    handleSubmit,
    reset,
  };
}
