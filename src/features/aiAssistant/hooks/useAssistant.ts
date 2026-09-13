import { useCallback, useRef, useState } from 'react';
import {
  getApiErrorMessage,
  useAssistantChatMutation,
  useLazyGetConversationQuery,
  useUploadDocumentMutation,
  type AssistantAttachment,
  type AssistantChatResult,
  type AssistantContextItem,
} from '@/services/api';
import { getOCRService } from '@/services/ocr';
import { logger } from '@/utils/logger';
import type {
  AssistantEntry,
  AssistantState,
  AssistantStatus,
  AttachmentChipData,
  PendingAttachment,
} from '../types';

export interface SendInput {
  text: string;
  attachments: PendingAttachment[];
  inputMode?: 'text' | 'voice';
}

export interface Assistant extends AssistantState {
  /** Resolves with the answer, or null when the turn failed (an error entry is shown). */
  send: (input: SendInput) => Promise<AssistantChatResult | null>;
  newConversation: () => void;
  /** Loads a saved conversation (from History) and continues it. */
  resume: (conversationId: string) => Promise<boolean>;
}

let nextId = 0;
const entryId = () => `a${++nextId}`;

/** Backend cap for inline OCR text (`ASSISTANT_OCR_TEXT_MAX`). */
export const OCR_ATTACHMENT_MAX_CHARS = 20_000;

/**
 * Long scans are clipped to what one turn can carry; the material that
 * matters most is almost always at the top, and the full text is still in
 * the OCR result itself.
 */
export function clipOcrText(text: string): string {
  return text.length <= OCR_ATTACHMENT_MAX_CHARS
    ? text
    : text.slice(0, OCR_ATTACHMENT_MAX_CHARS - 1).trimEnd() + '…';
}

const STATUS_TEXT: Record<AssistantStatus, string> = {
  idle: '',
  loading: 'Loading conversation…',
  uploading: 'Uploading…',
  reading: 'Reading text in the image…',
  thinking: 'Thinking…',
};

export { STATUS_TEXT };

/**
 * One assistant conversation:
 *
 *   files      -> POST /documents/upload (images also get on-device OCR)
 *   ocr text   -> sent inline
 *   analyses   -> sent inline
 *   turn       -> POST /ai/chat { conversationId, message, attachments }
 *
 * The backend keeps the conversation and every attachment as context, so
 * follow-ups only need the conversation id.
 */
export function useAssistant(): Assistant {
  const [assistantChat] = useAssistantChatMutation();
  const [uploadDocument] = useUploadDocumentMutation();
  const [loadConversation] = useLazyGetConversationQuery();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [entries, setEntries] = useState<AssistantEntry[]>([]);
  const [context, setContext] = useState<AssistantContextItem[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [status, setStatus] = useState<AssistantStatus>('idle');
  const sending = useRef(false);

  const send = useCallback(
    async ({ text, attachments, inputMode = 'text' }: SendInput) => {
      const message = text.trim();
      if ((!message && attachments.length === 0) || sending.current) {
        return null;
      }
      sending.current = true;

      const chips: AttachmentChipData[] = attachments.map(a =>
        a.kind === 'file'
          ? { type: a.file.kind === 'pdf' ? 'document' : 'image', title: a.file.name }
          : { type: a.kind, title: a.title },
      );
      setEntries(prev => [
        ...prev,
        {
          id: entryId(),
          role: 'user',
          content: message || (chips.length > 0 ? 'Tell me about this.' : ''),
          attachments: chips,
          inputMode,
        },
      ]);

      try {
        const payload: AssistantAttachment[] = [];
        for (const attachment of attachments) {
          payload.push(await resolveAttachment(attachment));
        }

        setStatus('thinking');
        const result = await assistantChat({
          conversationId: conversationId ?? undefined,
          message,
          attachments: payload,
          inputMode,
        }).unwrap();

        setConversationId(result.conversationId);
        setContext(result.context);
        setSuggestions(result.suggestions);
        setEntries(prev => [
          ...prev,
          {
            id: entryId(),
            role: 'assistant',
            content: result.answer,
            sources: result.sources,
            grounded: result.grounded,
            scope: result.scope,
            meta:
              result.scope === 'material'
                ? `${result.modelName} · ${result.processingMs} ms`
                : undefined,
          },
        ]);
        return result;
      } catch (error) {
        logger.warn('[assistant] turn failed', error);
        setEntries(prev => [
          ...prev,
          {
            id: entryId(),
            role: 'assistant',
            content:
              error instanceof Error && !('status' in error)
                ? error.message
                : getApiErrorMessage(error as never),
            error: true,
          },
        ]);
        return null;
      } finally {
        setStatus('idle');
        sending.current = false;
      }

      async function resolveAttachment(
        attachment: PendingAttachment,
      ): Promise<AssistantAttachment> {
        if (attachment.kind === 'ocr') {
          return { type: 'ocr', text: clipOcrText(attachment.text), title: attachment.title };
        }
        if (attachment.kind === 'analysis') {
          return {
            type: 'analysis',
            kind: attachment.analysisKind,
            data: attachment.data,
            title: attachment.title,
          };
        }
        const { file } = attachment;
        setStatus('uploading');
        const stored = await uploadDocument({
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        }).unwrap();
        if (stored.kind === 'pdf') {
          return { type: 'document', documentId: stored.id, title: stored.name };
        }
        // Images: read their text on the device so the backend can index it.
        let ocrText: string | undefined;
        const ocr = getOCRService();
        if (ocr.isAvailable()) {
          setStatus('reading');
          try {
            ocrText = clipOcrText((await ocr.recognize({ uri: file.uri })).text.trim()) || undefined;
          } catch (error) {
            logger.warn('[assistant] on-device OCR failed; sending image without text', error);
          }
        }
        return { type: 'image', documentId: stored.id, title: stored.name, text: ocrText };
      }
    },
    [assistantChat, conversationId, uploadDocument],
  );

  const resume = useCallback(
    async (id: string) => {
      if (sending.current) {
        return false;
      }
      sending.current = true;
      setStatus('loading');
      try {
        const conversation = await loadConversation(id).unwrap();
        setConversationId(conversation.id);
        setContext(conversation.context);
        setSuggestions([]);
        setEntries(
          conversation.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
              id: `s-${m.id}`,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              attachments: m.attachments.map(a => ({ type: a.type, title: a.title })),
              sources: m.sources,
              grounded: m.grounded ?? undefined,
            })),
        );
        return true;
      } catch (error) {
        logger.warn('[assistant] resume failed', error);
        setEntries([
          {
            id: entryId(),
            role: 'assistant',
            content: getApiErrorMessage(error as never),
            error: true,
          },
        ]);
        return false;
      } finally {
        setStatus('idle');
        sending.current = false;
      }
    },
    [loadConversation],
  );

  const newConversation = useCallback(() => {
    setConversationId(null);
    setEntries([]);
    setContext([]);
    setSuggestions([]);
    setStatus('idle');
  }, []);

  return {
    conversationId,
    entries,
    context,
    suggestions,
    status,
    isSending: status !== 'idle',
    send,
    newConversation,
    resume,
  };
}
