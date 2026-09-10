import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import {
  AppButton,
  AppHeader,
  AppTextInput,
  EmptyState,
  ScreenContainer,
} from '@/components';
import { createStyles } from '@/theme';
import { MessageBubble } from '../components/MessageBubble';
import { useChat } from '../hooks/useChat';

const useStyles = createStyles(t => ({
  list: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: t.layout.screenPadding,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.sm,
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
}));

export function AIAssistantScreen() {
  const styles = useStyles();
  const { messages, isSending, send } = useChat();
  const [draft, setDraft] = useState('');

  const handleSend = () => {
    if (!draft.trim()) {
      return;
    }
    send(draft);
    setDraft('');
  };

  return (
    <ScreenContainer edges={['top']} noPadding keyboardAvoiding>
      <AppHeader title="Assistant" size="compact" divider />
      <FlatList
        data={messages}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="✦"
            title="Ask anything"
            description="Summarise text, draft a reply, or explain a concept. Your conversation stays on this device."
          />
        }
      />
      <View style={styles.composer}>
        <AppTextInput
          containerStyle={styles.input}
          placeholder="Message the assistant…"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          editable={!isSending}
        />
        <AppButton
          title="Send"
          fullWidth={false}
          loading={isSending}
          disabled={!draft.trim()}
          onPress={handleSend}
        />
      </View>
    </ScreenContainer>
  );
}
