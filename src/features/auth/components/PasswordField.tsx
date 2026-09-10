import React, { forwardRef, useState } from 'react';
import { Pressable, type TextInputInstance } from 'react-native';
import { AppText, AppTextInput, type AppTextInputProps } from '@/components';
import { useTheme } from '@/theme';

export type PasswordFieldProps = Omit<
  AppTextInputProps,
  'secureTextEntry' | 'rightAccessory'
>;

/** Password input with a show / hide toggle and sensible keyboard flags. */
export const PasswordField = forwardRef<TextInputInstance, PasswordFieldProps>(
  function PasswordFieldBase(props, ref) {
    const { spacing } = useTheme();
    const [visible, setVisible] = useState(false);

    return (
      <AppTextInput
        ref={ref}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        rightAccessory={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={spacing.sm}
            onPress={() => setVisible(v => !v)}
          >
            <AppText variant="label" color="textLink">
              {visible ? 'Hide' : 'Show'}
            </AppText>
          </Pressable>
        }
        {...props}
      />
    );
  },
);
