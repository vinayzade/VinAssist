import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  AppTextInput,
  EmptyState,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import type { SourceChunk } from '@/services/api';
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
  sources: { gap: t.spacing.xs, marginTop: t.spacing.xs },
  source: {
    borderRadius: t.radius.md,
    padding: t.spacing.sm,
    gap: t.spacing.xxs,
  },
  sourceHead: { flexDirection: 'row', justifyContent: 'space-between' },
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

function Sources({ sources, testID }: { sources: SourceChunk[]; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const cited = sources.filter(s => s.cited);
  const shown = open ? sources : cited.length > 0 ? cited : sources.slice(0, 1);

  return (
    <View style={styles.sources} testID={testID}>
      <AppText variant="caption" color="textMuted">
        Sources: {cited.length > 0 ? `${cited.length} cited` : 'none cited'} · {sources.length} retrieved
      </AppText>
      {shown.map(source => (
        <View
          key={source.chunkId}
          style={[styles.source, { backgroundColor: source.cited ? colors.primarySoft : colors.surfaceSunken }]}
          testID={`${testID}-chunk-${source.chunkIndex}`}
        >
          <View style={styles.sourceHead}>
            <AppText variant="caption" color={source.cited ? 'primary' : 'textMuted'}>
              [{sources.indexOf(source) + 1}] Passage {source.chunkIndex + 1}
              {source.cited ? ' · cited' : ''}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {Math.round(source.similarity * 100)}% match
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary" numberOfLines={open ? undefined : 3}>
            {source.text}
          </AppText>
        </View>
      ))}
      {sources.length > shown.length || open ? (
        <AppButton
          title={open ? 'Show fewer' : `Show all ${sources.length} passages`}
          variant="link"
          size="sm"
          fullWidth={false}
          onPress={() => setOpen(v => !v)}
          testID={`${testID}-toggle`}
        />
      ) : null}
    </View>
  );
}

function Entry({ entry }: { entry: ChatEntry }) {
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
          <Sources sources={entry.sources} testID={`${entry.id}-sources`} />
        ) : null}
        {entry.meta ? (
          <AppText variant="caption" color="textMuted">
            {entry.meta}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** Ask questions about one uploaded document; answers cite retrieved passages. */
export function DocumentChatScreen({ route }: MainStackScreenProps<'DocumentChat'>) {
  const styles = useStyles();
  const { documentId, name, kind, localUri } = route.params;
  const chat = useDocumentChat({ documentId, kind, localUri });
  const [draft, setDraft] = useState('');

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
        renderItem={({ item }) => <Entry entry={item} />}
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
