import React, { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import {
  AppButton,
  AppHeader,
  AppTextInput,
  EmptyState,
  ScreenContainer,
} from '@/components';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
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
  // Compact multiline composer: starts one line tall, grows to ~5 lines,
  // then scrolls. Multiline also fixes an Android quirk where a single-line
  // field is measured by the newlines in its value (e.g. prefilled OCR text).
  composerField: {
    minHeight: t.layout.touchTarget + t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    alignItems: 'center',
  },
  composerInput: { maxHeight: 132 },
}));

export function AIAssistantScreen({
  navigation,
  route,
}: MainTabScreenProps<'AIAssistant'>) {
  const styles = useStyles();
  const { messages, isSending, send } = useChat();
  const [draft, setDraft] = useState('');
  const prefill = route.params?.prefill;

  // Another feature (e.g. OCR "Ask AI") handed us text: seed the composer
  // once, then clear the param so re-focusing the tab does not re-seed.
  useEffect(() => {
    if (prefill) {
      setDraft(prefill);
      navigation.setParams({ prefill: undefined });
    }
  }, [navigation, prefill]);

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
          fieldStyle={styles.composerField}
          inputStyle={styles.composerInput}
          placeholder="Message the assistant…"
          value={draft}
          onChangeText={setDraft}
          multiline
          editable={!isSending}
          testID="assistant-composer"
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
