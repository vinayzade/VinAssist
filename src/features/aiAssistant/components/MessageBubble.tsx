import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components';
import type { ChatMessage } from '@/services/api/aiApi';
import { createStyles } from '@/theme';

const useStyles = createStyles(t => ({
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm + t.spacing.xxs,
    borderRadius: t.radius.xl,
  },
  user: {
    alignSelf: 'flex-end',
    backgroundColor: t.colors.primary,
    borderBottomRightRadius: t.radius.sm,
  },
  assistant: {
    alignSelf: 'flex-start',
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderBottomLeftRadius: t.radius.sm,
  },
}));

export function MessageBubble({ message }: { message: ChatMessage }) {
  const styles = useStyles();
  const isUser = message.role === 'user';

  return (
    <View
      style={[styles.bubble, isUser ? styles.user : styles.assistant]}
      accessibilityRole="text"
      accessibilityLabel={`${isUser ? 'You' : 'Assistant'}: ${message.content}`}
    >
      <AppText color={isUser ? 'onPrimary' : 'text'}>{message.content}</AppText>
    </View>
  );
}
