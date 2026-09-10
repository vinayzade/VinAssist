import { useCallback, useState } from 'react';
import { useChatMutation, type ChatMessage } from '@/services/api/aiApi';
import { getApiErrorMessage } from '@/services/api/apiError';
import { logger } from '@/utils';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [chat, { isLoading: isSending, error }] = useChatMutation();

  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || isSending) {
        return;
      }

      const next: ChatMessage[] = [
        ...messages,
        { role: 'user', content: text },
      ];
      setMessages(next);

      try {
        const response = await chat({
          messages: next,
          conversationId,
        }).unwrap();
        setConversationId(response.conversationId ?? conversationId);
        setMessages(prev => [...prev, response.message]);
      } catch (err) {
        logger.error('chat failed', err);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: getApiErrorMessage(err as never) },
        ]);
      }
    },
    [chat, conversationId, isSending, messages],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
  }, []);

  return { messages, isSending, error, send, reset };
}
