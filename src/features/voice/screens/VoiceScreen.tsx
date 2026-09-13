import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, View } from 'react-native';
import { AppButton, AppText, EmptyState, ScreenContainer } from '@/components';
import {
  AssistantEntryView,
  AttachmentChip,
  AttachmentMenu,
  type AssistantEntry,
  type AttachmentChoice,
  type PendingAttachment,
} from '@/features/aiAssistant';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import {
  captureImageWithCamera,
  FileSelectionError,
  selectDocument,
  selectImageFromGallery,
  type SelectedFile,
} from '@/services/files';
import { createStyles, useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import { useVoiceAssistant, type VoicePhase } from '../hooks/useVoiceAssistant';

const useStyles = createStyles(t => ({
  list: {
    flexGrow: 1,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.sm,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.xs,
  },
  topBarText: { flexShrink: 1 },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.xs,
  },
  chips: { gap: t.spacing.xs, paddingRight: t.spacing.md },
  panel: {
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
    backgroundColor: t.colors.background,
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing.md,
    paddingBottom: t.spacing.lg,
    alignItems: 'center',
    gap: t.spacing.sm,
  },
  transcript: {
    minHeight: 44,
    alignSelf: 'stretch',
    borderRadius: t.radius.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    justifyContent: 'center',
  },
  mic: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Always painted: Android drops the corner radius on a view whose
  // background only appears later.
  micRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.background,
  },
  micRingActive: { backgroundColor: t.colors.errorSoft },
  toolbar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.spacing.sm,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  pending: { alignSelf: 'stretch' },
}));

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: 'Tap to speak',
  listening: 'Listening… tap when you are done',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to stop',
};

const PHASE_GLYPH: Record<VoicePhase, string> = {
  idle: '🎤',
  listening: '■',
  thinking: '…',
  speaking: '🔊',
};

let nextAttachmentId = 0;
const attachmentId = () => `v${++nextAttachmentId}`;

/**
 * Hands-free assistant: speak a question, hear the answer. Uses the same
 * scoped assistant and conversation as the Assistant tab; material can be
 * attached here too so the answers have something to draw on.
 */
export function VoiceScreen(_props: MainStackScreenProps<'Voice'>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const voice = useVoiceAssistant();
  const { assistant } = voice;
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const listRef = useRef<FlatList<AssistantEntry>>(null);

  const addFile = useCallback(async (pick: () => Promise<SelectedFile | null>) => {
    setPickError(null);
    try {
      const file = await pick();
      if (file) {
        setPending(prev => [...prev, { id: attachmentId(), kind: 'file', file }]);
      }
    } catch (err) {
      logger.warn('[voice] attachment failed', err);
      setPickError(
        err instanceof FileSelectionError ? err.message : 'Could not attach that. Please try again.',
      );
    }
  }, []);

  const onChoose = useCallback(
    (choice: AttachmentChoice) => {
      setMenuOpen(false);
      if (choice === 'camera') {
        addFile(captureImageWithCamera);
      } else if (choice === 'gallery') {
        addFile(selectImageFromGallery);
      } else {
        addFile(() => selectDocument({ kinds: ['pdf', 'image'] }));
      }
    },
    [addFile],
  );

  const onMic = useCallback(async () => {
    if (voice.phase === 'speaking') {
      voice.stop();
      return;
    }
    const attachments = pending;
    if (voice.phase === 'idle') {
      setPending([]);
    }
    await voice.toggleListening(attachments);
  }, [pending, voice]);

  const { canSpeak, speak } = voice;
  const renderEntry = useCallback(
    ({ item }: { item: AssistantEntry }) => (
      <AssistantEntryView
        entry={item}
        onSpeak={item.role === 'assistant' && canSpeak && !item.error ? speak : undefined}
      />
    ),
    [canSpeak, speak],
  );

  const busy = voice.phase === 'thinking';
  const micColor =
    voice.phase === 'listening'
      ? colors.error
      : voice.phase === 'speaking'
      ? colors.success
      : busy
      ? colors.surfaceSunken
      : colors.primary;

  return (
    <ScreenContainer edges={['bottom']} noPadding testID="voice-screen">
      <View style={styles.topBar}>
        <AppText variant="caption" color="textMuted" style={styles.topBarText}>
          Ask about your material by speaking. Audio stays on this device.
        </AppText>
        {assistant.entries.length > 0 ? (
          <AppButton
            title="New chat"
            variant="link"
            size="sm"
            fullWidth={false}
            disabled={busy}
            onPress={() => {
              voice.stop();
              assistant.newConversation();
            }}
            testID="voice-new"
          />
        ) : null}
      </View>

      {assistant.context.length > 0 ? (
        <View style={styles.context} testID="voice-context">
          <AppText variant="caption" color="textMuted">
            Using
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {assistant.context.map((item, index) => (
              <AttachmentChip
                key={`${item.type}-${item.documentId ?? item.title}-${index}`}
                kind={item.type}
                title={item.title}
                muted={item.indexed === false}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <FlatList
        ref={listRef}
        data={assistant.entries}
        keyExtractor={item => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <EmptyState
            icon="●"
            title="Talk to the assistant"
            description="Attach a document or photo, then tap the microphone and ask about it. Your speech is transcribed on this device and the answer can be read back to you."
            testID="voice-empty"
          />
        }
      />

      <View style={styles.panel}>
        {pending.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.pending}
            testID="voice-pending"
          >
            {pending.map(item => (
              <AttachmentChip
                key={item.id}
                kind={item.kind === 'file' ? (item.file.kind === 'pdf' ? 'document' : 'image') : item.kind}
                title={item.kind === 'file' ? item.file.name : item.title}
                onRemove={() => setPending(prev => prev.filter(a => a.id !== item.id))}
                testID={`voice-pending-${item.id}`}
              />
            ))}
          </ScrollView>
        ) : null}

        <View
          style={[
            styles.transcript,
            {
              backgroundColor:
                voice.phase === 'listening' ? colors.errorSoft : colors.surfaceSunken,
            },
          ]}
          accessibilityLiveRegion="polite"
          testID="voice-transcript"
        >
          <AppText
            variant="body"
            color={voice.error ? 'error' : voice.phase === 'listening' ? 'error' : 'textSecondary'}
            align="center"
            numberOfLines={3}
            testID="voice-transcript-text"
          >
            {voice.error ??
              pickError ??
              (voice.phase === 'listening'
                ? voice.partial || 'Listening…'
                : voice.transcript || 'Your words will appear here.')}
          </AppText>
        </View>

        <View style={[styles.micRing, voice.phase === 'listening' && styles.micRingActive]}>
          <Pressable
            onPress={onMic}
            disabled={busy || !voice.canListen}
            accessibilityRole="button"
            accessibilityLabel={PHASE_LABEL[voice.phase]}
            accessibilityState={{ disabled: busy || !voice.canListen, busy }}
            style={({ pressed }) => [styles.mic, { backgroundColor: micColor, opacity: pressed ? 0.85 : 1 }]}
            testID="voice-mic"
          >
            <AppText variant="h1" color={busy ? 'textMuted' : 'onPrimary'}>
              {PHASE_GLYPH[voice.phase]}
            </AppText>
          </Pressable>
        </View>
        <AppText variant="caption" color="textMuted" testID="voice-phase">
          {voice.canListen ? PHASE_LABEL[voice.phase] : 'Voice input is not available on this device.'}
        </AppText>

        <View style={styles.toolbar}>
          <AppButton
            title="+ Attach"
            variant="link"
            size="sm"
            fullWidth={false}
            disabled={busy || voice.phase === 'listening'}
            onPress={() => setMenuOpen(true)}
            testID="voice-attach"
          />
          {voice.canSpeak ? (
            <View style={styles.toggle}>
              <AppText variant="caption" color="textSecondary">
                Read answers aloud
              </AppText>
              <Switch
                value={voice.autoSpeak}
                onValueChange={voice.setAutoSpeak}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
                thumbColor={colors.surfaceElevated}
                accessibilityLabel="Read answers aloud"
                testID="voice-autospeak"
              />
            </View>
          ) : null}
        </View>
      </View>

      <AttachmentMenu visible={menuOpen} onChoose={onChoose} onClose={() => setMenuOpen(false)} />
    </ScreenContainer>
  );
}
