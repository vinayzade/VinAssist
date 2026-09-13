import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { AppText, AppTextInput } from '@/components';
import { createStyles, useTheme } from '@/theme';
import type { PendingAttachment } from '../types';
import type { VoiceStatus } from '../hooks/useVoiceInput';
import { AttachmentChip } from './AttachmentChip';

export interface AssistantComposerProps {
  draft: string;
  onChangeDraft: (text: string) => void;
  attachments: PendingAttachment[];
  onRemoveAttachment: (id: string) => void;
  onAttach: () => void;
  onCamera: () => void;
  onSend: () => void;
  /** Hidden when voice input is unavailable on this device/build. */
  voice?: {
    status: VoiceStatus;
    partial: string;
    onToggle: () => void;
  };
  /** Disables input while a turn is in flight; shows `statusText`. */
  busy: boolean;
  statusText?: string;
  error?: string | null;
}

const useStyles = createStyles(t => ({
  root: {
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
    backgroundColor: t.colors.background,
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.md,
    gap: t.spacing.sm,
  },
  chips: { gap: t.spacing.xs, paddingRight: t.spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.xs },
  input: { flex: 1 },
  // Starts one line tall, grows to ~5 lines, then scrolls. Multiline also
  // avoids an Android quirk where a single-line field is measured by the
  // newlines in its value.
  field: {
    minHeight: t.layout.touchTarget + t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    alignItems: 'center',
  },
  fieldInput: { maxHeight: 132 },
  icon: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget + t.spacing.xs,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: undefined,
    minWidth: t.layout.touchTarget + t.spacing.lg,
    paddingHorizontal: t.spacing.md,
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  listening: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grow: { flex: 1 },
}));

function IconButton({
  glyph,
  label,
  onPress,
  disabled,
  active,
  testID,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(active) }}
      style={({ pressed }) => [
        styles.icon,
        {
          backgroundColor: active
            ? colors.error
            : pressed
            ? colors.surfaceSunken
            : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      testID={testID}
    >
      <AppText variant="title" color={active ? 'onPrimary' : 'primary'}>
        {glyph}
      </AppText>
    </Pressable>
  );
}

/**
 * The message bar: attach (+), camera, text field, microphone and send.
 * Queued attachments show as removable chips above the field.
 */
export function AssistantComposer({
  draft,
  onChangeDraft,
  attachments,
  onRemoveAttachment,
  onAttach,
  onCamera,
  onSend,
  voice,
  busy,
  statusText,
  error,
}: AssistantComposerProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const listening = voice?.status === 'listening';
  const canSend = !busy && !listening && (draft.trim().length > 0 || attachments.length > 0);

  return (
    <View style={styles.root} testID="assistant-composer">
      {attachments.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
          testID="assistant-pending"
        >
          {attachments.map(item => (
            <AttachmentChip
              key={item.id}
              kind={
                item.kind === 'file'
                  ? item.file.kind === 'pdf'
                    ? 'document'
                    : 'image'
                  : item.kind
              }
              title={item.kind === 'file' ? item.file.name : item.title}
              onRemove={busy ? undefined : () => onRemoveAttachment(item.id)}
              testID={`assistant-pending-${item.id}`}
            />
          ))}
        </ScrollView>
      ) : null}

      {busy && statusText ? (
        <View style={styles.status} accessibilityLiveRegion="polite" testID="assistant-status">
          <ActivityIndicator size="small" color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            {statusText}
          </AppText>
        </View>
      ) : null}

      {listening ? (
        <View
          style={[styles.listening, { backgroundColor: colors.errorSoft }]}
          accessibilityLiveRegion="polite"
          testID="assistant-listening"
        >
          <View style={[styles.dot, { backgroundColor: colors.error }]} />
          <AppText variant="caption" color="error" numberOfLines={2} style={styles.grow}>
            {voice?.partial ? voice.partial : 'Listening… tap the microphone when you are done.'}
          </AppText>
        </View>
      ) : null}

      {error ? (
        <AppText variant="caption" color="error" accessibilityLiveRegion="polite" testID="assistant-composer-error">
          {error}
        </AppText>
      ) : null}

      <View style={styles.row}>
        <IconButton
          glyph="+"
          label="Attach a document or photo"
          onPress={onAttach}
          disabled={busy || listening}
          testID="assistant-attach"
        />
        <IconButton
          glyph="◉"
          label="Take a photo"
          onPress={onCamera}
          disabled={busy || listening}
          testID="assistant-camera"
        />
        <AppTextInput
          containerStyle={styles.input}
          fieldStyle={styles.field}
          inputStyle={styles.fieldInput}
          placeholder={
            attachments.length > 0 ? 'Ask about the attachment…' : 'Ask about your documents…'
          }
          value={draft}
          onChangeText={onChangeDraft}
          multiline
          editable={!busy && !listening}
          testID="assistant-input"
        />
        {voice ? (
          <IconButton
            glyph={listening ? '■' : '●'}
            label={listening ? 'Stop listening' : 'Speak your question'}
            onPress={voice.onToggle}
            disabled={busy || voice.status === 'processing'}
            active={listening}
            testID="assistant-mic"
          />
        ) : null}
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [
            styles.icon,
            styles.send,
            {
              backgroundColor: canSend
                ? pressed
                  ? colors.primaryPressed
                  : colors.primary
                : colors.surfaceSunken,
            },
          ]}
          testID="assistant-send"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <AppText variant="button" color={canSend ? 'onPrimary' : 'textDisabled'} numberOfLines={1}>
              Send
            </AppText>
          )}
        </Pressable>
      </View>
    </View>
  );
}
