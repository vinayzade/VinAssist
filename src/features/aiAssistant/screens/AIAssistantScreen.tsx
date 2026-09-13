import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { AppButton, AppHeader, AppText, EmptyState, ScreenContainer } from '@/components';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import {
  captureImageWithCamera,
  FileSelectionError,
  selectDocument,
  selectImageFromGallery,
  type SelectedFile,
} from '@/services/files';
import { getVoiceService } from '@/services/voice';
import { createStyles, useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import { AssistantComposer } from '../components/AssistantComposer';
import { AssistantEntryView } from '../components/AssistantEntryView';
import { AttachmentChip } from '../components/AttachmentChip';
import { AttachmentMenu, type AttachmentChoice } from '../components/AttachmentMenu';
import { STATUS_TEXT, useAssistant } from '../hooks/useAssistant';
import { useVoiceInput } from '../hooks/useVoiceInput';
import type { AssistantEntry, AssistantHandoff, PendingAttachment } from '../types';

const useStyles = createStyles(t => ({
  list: {
    flexGrow: 1,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.md,
  },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.xs,
  },
  contextChips: { gap: t.spacing.xs, paddingRight: t.spacing.md },
  suggestions: {
    gap: t.spacing.xs,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.xs,
  },
  suggestion: {
    borderRadius: t.radius.full,
    borderWidth: 1,
    borderColor: t.colors.border,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: t.spacing.sm,
    marginTop: t.spacing.md,
  },
}));

let nextAttachmentId = 0;
const attachmentId = () => `p${++nextAttachmentId}`;

function fromHandoff(handoff: AssistantHandoff): PendingAttachment {
  if (handoff.type === 'ocr') {
    return {
      id: attachmentId(),
      kind: 'ocr',
      title: handoff.title ?? 'Recognised text',
      text: handoff.text,
    };
  }
  return {
    id: attachmentId(),
    kind: 'analysis',
    title: handoff.title,
    analysisKind: handoff.kind,
    data: handoff.data,
  };
}

/**
 * The multimodal assistant tab. Text, voice, camera, photos and files all
 * end up as one turn against `/ai/chat`; the backend keeps the conversation
 * and only ever answers from the user's own material.
 */
export function AIAssistantScreen({ navigation, route }: MainTabScreenProps<'AIAssistant'>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const assistant = useAssistant();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text');
  const listRef = useRef<FlatList<AssistantEntry>>(null);
  const speaker = getVoiceService();
  const canSpeak = speaker.canSpeak();

  useEffect(() => () => speaker.stopSpeaking(), [speaker]);

  // Stable row props so memoised rows are skipped while the composer changes.
  const onSpeak = useCallback(
    (text: string) => {
      speaker.speak(text).catch(() => undefined);
    },
    [speaker],
  );
  const renderEntry = useCallback(
    ({ item }: { item: AssistantEntry }) => (
      <AssistantEntryView entry={item} onSpeak={canSpeak ? onSpeak : undefined} />
    ),
    [canSpeak, onSpeak],
  );

  const voice = useVoiceInput({
    onTranscript: text => {
      setDraft(prev => (prev.trim() ? `${prev.trim()} ${text}` : text));
      setInputMode('voice');
    },
  });

  // Another screen handed us material ("Ask the assistant" on a result) or
  // legacy prefill text: queue it once, then clear the params so re-focusing
  // the tab does not re-queue.
  const handoff = route.params?.attach;
  const prefill = route.params?.prefill;
  const resumeId = route.params?.resume;
  useEffect(() => {
    if (handoff) {
      setPending(prev => [...prev, fromHandoff(handoff)]);
    }
    if (prefill) {
      setDraft(prefill);
    }
    if (resumeId) {
      assistant.resume(resumeId);
    }
    if (handoff || prefill || resumeId) {
      navigation.setParams({ attach: undefined, prefill: undefined, resume: undefined });
    }
    // `assistant` changes identity every render; only the params matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, navigation, prefill, resumeId]);

  const addFile = useCallback(
    async (pick: () => Promise<SelectedFile | null>) => {
      setPickError(null);
      try {
        const file = await pick();
        if (file) {
          setPending(prev => [...prev, { id: attachmentId(), kind: 'file', file }]);
        }
      } catch (error) {
        logger.warn('[assistant] attachment failed', error);
        setPickError(
          error instanceof FileSelectionError
            ? error.message
            : 'Could not attach that. Please try again.',
        );
      }
    },
    [],
  );

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

  const send = useCallback(async () => {
    const text = draft;
    const attachments = pending;
    const mode = inputMode;
    setDraft('');
    setPending([]);
    setInputMode('text');
    setPickError(null);
    const ok = await assistant.send({ text, attachments, inputMode: mode });
    if (!ok && attachments.length > 0) {
      // Keep the material so the user can retry without re-attaching.
      setPending(attachments);
    }
  }, [assistant, draft, inputMode, pending]);

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const empty = assistant.entries.length === 0;

  return (
    <ScreenContainer edges={['top']} noPadding keyboardAvoiding testID="assistant-screen">
      <AppHeader
        title="Assistant"
        subtitle="Your documents, images and results"
        size="compact"
        divider
        right={
          !empty ? (
            <AppButton
              title="New chat"
              variant="link"
              size="sm"
              fullWidth={false}
              disabled={assistant.isSending}
              onPress={assistant.newConversation}
              testID="assistant-new"
            />
          ) : undefined
        }
      />

      {assistant.context.length > 0 ? (
        <View style={styles.context} testID="assistant-context">
          <AppText variant="caption" color="textMuted">
            Using
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.contextChips}
          >
            {assistant.context.map((item, index) => (
              <AttachmentChip
                key={`${item.type}-${item.documentId ?? item.title}-${index}`}
                kind={item.type}
                title={item.title}
                muted={item.indexed === false}
                testID={`assistant-context-${index}`}
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
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToEnd}
        ListEmptyComponent={
          <EmptyState
            icon="✦"
            title="Ask about your material"
            description="Attach a document, photo or file, or send a result from Smart OCR, Image Quality or Sentiment. Answers come only from what you attach, with the passages they were based on."
            testID="assistant-empty"
          />
        }
        ListFooterComponent={
          empty ? (
            <View style={styles.emptyActions}>
              <AppButton
                title="Attach a file"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => onChoose('document')}
                testID="assistant-empty-file"
              />
              <AppButton
                title="Take a photo"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => onChoose('camera')}
                testID="assistant-empty-camera"
              />
              <AppButton
                title="Scan text"
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={() => navigation.navigate('OCR')}
                testID="assistant-empty-ocr"
              />
            </View>
          ) : undefined
        }
      />

      {assistant.suggestions.length > 0 && !assistant.isSending ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.suggestions}
          testID="assistant-suggestions"
        >
          {assistant.suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion}
              onPress={() => setDraft(suggestion)}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.suggestion,
                { backgroundColor: pressed ? colors.surfaceSunken : colors.surfaceElevated },
              ]}
              testID={`assistant-suggestion-${index}`}
            >
              <AppText variant="caption" color="primary">
                {suggestion}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <AssistantComposer
        draft={draft}
        onChangeDraft={text => {
          setDraft(text);
          if (!text) {
            setInputMode('text');
          }
        }}
        attachments={pending}
        onRemoveAttachment={id => setPending(prev => prev.filter(a => a.id !== id))}
        onAttach={() => setMenuOpen(true)}
        onCamera={() => onChoose('camera')}
        onSend={send}
        voice={
          voice.isAvailable
            ? { status: voice.status, partial: voice.partial, onToggle: voice.toggle }
            : undefined
        }
        busy={assistant.isSending}
        statusText={STATUS_TEXT[assistant.status]}
        error={pickError ?? voice.error}
      />

      <AttachmentMenu visible={menuOpen} onChoose={onChoose} onClose={() => setMenuOpen(false)} />
    </ScreenContainer>
  );
}
