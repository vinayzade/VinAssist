import React, { forwardRef, useState, type ReactNode } from 'react';
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { createStyles, useTheme } from '@/theme';
import { AppText } from './AppText';

export interface AppTextInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Guidance shown under the field when there is no error. */
  helperText?: string;
  /** Marks the field invalid and replaces `helperText`. */
  errorText?: string;
  leftAccessory?: ReactNode;
  rightAccessory?: ReactNode;
  /** Style for the outer wrapper (label + field + helper). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Grows the field for long-form text (chat, notes). */
  multiline?: boolean;
  /** Overrides for the bordered field box (e.g. a compact chat composer). */
  fieldStyle?: StyleProp<ViewStyle>;
  /** Overrides for the TextInput itself (e.g. `maxHeight` to cap growth). */
  inputStyle?: StyleProp<TextStyle>;
}

const useStyles = createStyles(t => ({
  container: { alignSelf: 'stretch' },
  label: { marginBottom: t.spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: t.layout.touchTarget + t.spacing.xs,
    borderWidth: 1,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    gap: t.spacing.sm,
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    minHeight: 120,
    paddingVertical: t.spacing.sm,
  },
  input: {
    flex: 1,
    ...t.typography.body,
    paddingVertical: t.spacing.sm,
    // Android adds its own vertical padding; keep the text vertically centred.
    includeFontPadding: false,
  },
  inputMultiline: { textAlignVertical: 'top' },
  helper: { marginTop: t.spacing.xs },
}));

export const AppTextInput = forwardRef<TextInputInstance, AppTextInputProps>(
  function AppTextInputBase(
    {
      label,
      helperText,
      errorText,
      leftAccessory,
      rightAccessory,
      containerStyle,
      multiline,
      fieldStyle,
      inputStyle,
      editable = true,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) {
    const { colors } = useTheme();
    const styles = useStyles();
    const [focused, setFocused] = useState(false);
    const hasError = Boolean(errorText);

    const borderColor = hasError
      ? colors.error
      : focused
      ? colors.borderFocus
      : colors.borderStrong;

    return (
      <View style={[styles.container, containerStyle]}>
        {label ? (
          <AppText variant="label" color="textSecondary" style={styles.label}>
            {label}
          </AppText>
        ) : null}

        <View
          style={[
            styles.field,
            multiline && styles.fieldMultiline,
            {
              backgroundColor: editable
                ? colors.inputBackground
                : colors.surfaceSunken,
              borderColor,
            },
            fieldStyle,
          ]}
        >
          {leftAccessory}
          <TextInput
            ref={ref}
            style={[
              styles.input,
              multiline && styles.inputMultiline,
              { color: editable ? colors.text : colors.textDisabled },
              inputStyle,
            ]}
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            editable={editable}
            multiline={multiline}
            accessibilityLabel={label}
            accessibilityState={{ disabled: !editable }}
            onFocus={e => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={e => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...rest}
          />
          {rightAccessory}
        </View>

        {errorText || helperText ? (
          <AppText
            variant="caption"
            color={hasError ? 'error' : 'textMuted'}
            style={styles.helper}
            accessibilityLiveRegion={hasError ? 'polite' : 'none'}
          >
            {errorText ?? helperText}
          </AppText>
        ) : null}
      </View>
    );
  },
);
