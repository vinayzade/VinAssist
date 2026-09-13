import React, { memo, useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  AppTextInput,
  EmptyState,
  LoadingIndicator,
  PassageSources,
  ScreenContainer,
} from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import { createStyles, useTheme } from '@/theme';
import { useDocumentChat, type ChatEntry } from '../hooks/useDocumentChat';

const useStyles = createStyles(t => ({
  list: {
    flexGrow: 1,
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.md,
  },
  bubbleRow: { flexDirection: 'row' },
  user: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '88%',
    borderRadius: t.radius.xl,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.xs,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: t.spacing.sm,
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.md,
    borderTopWidth: 1,
    borderTopColor: t.colors.divider,
    backgroundColor: t.colors.background,
  },
  input: { flex: 1 },
  composerField: {
    minHeight: t.layout.touchTarget + t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    alignItems: 'center',
  },
  composerInput: { maxHeight: 120 },
  status: { paddingHorizontal: t.layout.screenPadding, paddingVertical: t.spacing.sm },
}));

const Entry = memo(function EntryBase({ entry }: { entry: ChatEntry }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isUser = entry.role === 'user';
  return (
    <View style={[styles.bubbleRow, isUser && styles.user]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser
              ? colors.primary
              : entry.error
              ? colors.errorSoft
              : colors.surfaceSunken,
          },
        ]}
        testID={`chat-${entry.role}`}
      >
        <AppText
          variant="body"
          color={isUser ? 'onPrimary' : entry.error ? 'error' : 'text'}
          selectable
          testID={`chat-${entry.role}-text`}
        >
          {entry.content}
        </AppText>
        {entry.grounded === false && !entry.error ? (
          <AppText variant="caption" color="textMuted">
            Not found in the document.
          </AppText>
        ) : null}
        {entry.sources && entry.sources.length > 0 ? (
          <PassageSources sources={entry.sources} testID={`${entry.id}-sources`} />
        ) : null}
        {entry.meta ? (
          <AppText variant="caption" color="textMuted">
            {entry.meta}
          </AppText>
        ) : null}
      </View>
    </View>
  );
});

/** Ask questions about one uploaded document; answers cite retrieved passages. */
export function DocumentChatScreen({ route }: MainStackScreenProps<'DocumentChat'>) {
  const styles = useStyles();
  const { documentId, name, kind, localUri } = route.params;
  const chat = useDocumentChat({ documentId, kind, localUri });
  const [draft, setDraft] = useState('');
  const renderEntry = useCallback(({ item }: { item: ChatEntry }) => <Entry entry={item} />, []);

  const send = () => {
    if (!draft.trim()) {
      return;
    }
    const question = draft;
    setDraft('');
    chat.ask(question);
  };

  return (
    <ScreenContainer edges={['bottom']} noPadding keyboardAvoiding testID="document-chat-screen">
      <AppHeader title="Chat with document" subtitle={name} size="compact" divider />

      {chat.indexState === 'indexing' ? (
        <View style={styles.status} testID="document-chat-indexing">
          <LoadingIndicator message={kind === 'image' ? 'Reading text and indexing…' : 'Indexing document…'} />
        </View>
      ) : chat.indexState === 'error' ? (
        <View style={styles.status}>
          <AppCard variant="tinted">
            <AppText color="error" testID="document-chat-index-error">
              {chat.indexError}
            </AppText>
            <AppButton title="Try again" variant="link" size="sm" onPress={() => chat.prepare(true)} />
          </AppCard>
        </View>
      ) : chat.indexInfo ? (
        <View style={styles.status}>
          <AppText variant="caption" color="textMuted" testID="document-chat-index-info">
            Indexed {chat.indexInfo.chunkCount} passages · {chat.indexInfo.embeddingModel}
          </AppText>
        </View>
      ) : null}

      <FlatList
        data={chat.entries}
        keyExtractor={item => item.id}
        renderItem={renderEntry}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="?"
            title="Ask about this document"
            description="Answers come only from the document's own text. Each answer shows the passages it used."
          />
        }
      />

      <View style={styles.composer}>
        <AppTextInput
          containerStyle={styles.input}
          fieldStyle={styles.composerField}
          inputStyle={styles.composerInput}
          placeholder="e.g. What is the total due?"
          value={draft}
          onChangeText={setDraft}
          multiline
          editable={chat.indexState === 'ready' && !chat.isAsking}
          testID="document-chat-input"
        />
        <AppButton
          title="Ask"
          fullWidth={false}
          loading={chat.isAsking}
          disabled={!draft.trim() || chat.indexState !== 'ready'}
          onPress={send}
          testID="document-chat-send"
        />
      </View>
    </ScreenContainer>
  );
}
