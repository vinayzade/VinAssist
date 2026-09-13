import React, { memo } from 'react';
import { View } from 'react-native';
import { AppButton, AppText, PassageSources } from '@/components';
import { createStyles, useTheme } from '@/theme';
import type { AssistantEntry } from '../types';
import { AttachmentChip } from './AttachmentChip';

const useStyles = createStyles(t => ({
  row: { flexDirection: 'row' },
  user: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '88%',
    borderRadius: t.radius.xl,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.xs,
  },
  userBubble: { borderBottomRightRadius: t.radius.sm },
  assistantBubble: { borderBottomLeftRadius: t.radius.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs },
}));

export interface AssistantEntryViewProps {
  entry: AssistantEntry;
  /** When given, answers get a "Listen" action that reads them aloud. */
  onSpeak?: (text: string) => void;
}

/**
 * One turn: the user's message with its attachment chips, or an answer with
 * its sources. Memoised: entries are immutable objects, so the list can
 * re-render (composer keystrokes, status changes) without touching rows.
 */
export const AssistantEntryView = memo(function AssistantEntryViewBase({
  entry,
  onSpeak,
}: AssistantEntryViewProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isUser = entry.role === 'user';

  return (
    <View style={[styles.row, isUser && styles.user]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          {
            backgroundColor: isUser
              ? colors.primary
              : entry.error
              ? colors.errorSoft
              : colors.surfaceSunken,
          },
        ]}
        accessibilityRole="text"
        accessibilityLabel={`${isUser ? 'You' : 'Assistant'}: ${entry.content}`}
        testID={`assistant-${entry.role}`}
      >
        {entry.attachments && entry.attachments.length > 0 ? (
          <View style={styles.chips}>
            {entry.attachments.map((chip, index) => (
              <AttachmentChip
                key={`${entry.id}-${index}`}
                kind={chip.type}
                title={chip.title}
                onPrimary
                testID={`${entry.id}-chip-${index}`}
              />
            ))}
          </View>
        ) : null}
        {entry.content ? (
          <AppText
            variant="body"
            color={isUser ? 'onPrimary' : entry.error ? 'error' : 'text'}
            selectable
            testID={`assistant-${entry.role}-text`}
          >
            {entry.content}
          </AppText>
        ) : null}
        {entry.inputMode === 'voice' ? (
          <AppText variant="caption" color="onPrimary">
            ● spoken
          </AppText>
        ) : null}
        {entry.scope === 'material' && entry.grounded === false && !entry.error ? (
          <AppText variant="caption" color="textMuted" testID={`${entry.id}-not-found`}>
            Not found in your attached material.
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
        {!isUser && !entry.error && onSpeak ? (
          <AppButton
            title="Listen"
            variant="link"
            size="sm"
            fullWidth={false}
            onPress={() => onSpeak(entry.content)}
            testID={`${entry.id}-listen`}
          />
        ) : null}
      </View>
    </View>
  );
});
