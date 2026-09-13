import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, View } from 'react-native';
import { createStyles, useTheme } from '@/theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { AppTextInput } from './AppTextInput';

export interface PromptDialogProps {
  visible: boolean;
  title: string;
  /** Initial field value; reset every time the dialog opens. */
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  maxLength?: number;
  onConfirm: (value: string) => void;
  onClose: () => void;
  testID?: string;
}

const useStyles = createStyles(t => ({
  backdrop: { flex: 1, justifyContent: 'center', padding: t.layout.screenPadding },
  card: {
    borderRadius: t.radius.xl,
    padding: t.spacing.lg,
    gap: t.spacing.md,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm },
}));

/** A single-field text prompt (rename and the like). */
export function PromptDialog({
  visible,
  title,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  maxLength = 200,
  onConfirm,
  onClose,
  testID = 'prompt-dialog',
}: PromptDialogProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [initialValue, visible]);

  const canConfirm = value.trim().length > 0 && value.trim() !== initialValue.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable
          style={[{ backgroundColor: colors.overlay }, styles.backdrop]}
          onPress={onClose}
          accessibilityLabel="Cancel"
        >
          <Pressable onPress={() => undefined}>
            <View style={[styles.card, { backgroundColor: colors.surfaceElevated }]} testID={testID}>
              <AppText variant="title">{title}</AppText>
              <AppTextInput
                value={value}
                onChangeText={setValue}
                placeholder={placeholder}
                maxLength={maxLength}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => canConfirm && onConfirm(value.trim())}
                testID={`${testID}-input`}
              />
              <View style={styles.actions}>
                <AppButton title="Cancel" variant="ghost" fullWidth={false} onPress={onClose} />
                <AppButton
                  title={confirmLabel}
                  fullWidth={false}
                  disabled={!canConfirm}
                  onPress={() => onConfirm(value.trim())}
                  testID={`${testID}-confirm`}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
