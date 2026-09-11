import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getApiErrorMessage,
  getErrorStatus,
  useDocumentChatMutation,
  useIndexDocumentMutation,
  type DocumentChatResult,
  type DocumentChatTurn,
  type IndexDocumentResult,
  type SourceChunk,
} from '@/services/api';
import { getOCRService } from '@/services/ocr';
import { logger } from '@/utils/logger';

export type IndexState = 'idle' | 'indexing' | 'ready' | 'error';

export interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceChunk[];
  grounded?: boolean;
  meta?: string;
  error?: boolean;
}

export interface DocumentChatState {
  indexState: IndexState;
  indexInfo: IndexDocumentResult | null;
  indexError: string | null;
  /** (Re)indexes: images are OCR'd on the device first; PDFs use their text layer. */
  prepare: (force?: boolean) => Promise<void>;
  entries: ChatEntry[];
  isAsking: boolean;
  ask: (question: string) => Promise<DocumentChatResult | null>;
  reset: () => void;
}

interface Options {
  documentId: string;
  kind: 'pdf' | 'image';
  /** Local file URI, needed to run on-device OCR for images. */
  localUri?: string;
}

let nextId = 0;
const entryId = () => `e${++nextId}`;

/**
 * Drives the RAG flow from the app:
 *
 *   image -> on-device OCR -> POST /documents/{id}/index (text)
 *   pdf   ->                  POST /documents/{id}/index (server text layer)
 *   question -> POST /ai/document-chat -> answer + sources
 *
 * The document is indexed once up front so the first answer is fast.
 */
export function useDocumentChat({ documentId, kind, localUri }: Options): DocumentChatState {
  const [indexDocument] = useIndexDocumentMutation();
  const [documentChat, { isLoading: isAsking }] = useDocumentChatMutation();
  const [indexState, setIndexState] = useState<IndexState>('idle');
  const [indexInfo, setIndexInfo] = useState<IndexDocumentResult | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const history = useRef<DocumentChatTurn[]>([]);

  const prepare = useCallback(
    async (force = false) => {
      setIndexState('indexing');
      setIndexError(null);
      try {
        let text: string | undefined;
        if (kind === 'image') {
          if (!localUri) {
            throw new Error('The image is no longer available on this device.');
          }
          const ocr = await getOCRService().recognize({ uri: localUri });
          text = ocr.text;
          if (!text.trim()) {
            throw new Error('No text could be read from this image.');
          }
        }
        const info = await indexDocument({ id: documentId, text, force }).unwrap();
        setIndexInfo(info);
        setIndexState('ready');
      } catch (error) {
        logger.warn('[documentChat] index failed', error);
        setIndexState('error');
        setIndexError(
          error instanceof Error && !('status' in error)
            ? error.message
            : getErrorStatus(error as never) === 422
            ? 'This document has no readable text to chat about.'
            : getApiErrorMessage(error as never),
        );
      }
    },
    [documentId, indexDocument, kind, localUri],
  );

  useEffect(() => {
    prepare();
    // Index once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isAsking) {
        return null;
      }
      setEntries(prev => [...prev, { id: entryId(), role: 'user', content: trimmed }]);
      try {
        const result = await documentChat({
          documentId,
          question: trimmed,
          history: history.current.slice(-6),
        }).unwrap();
        history.current.push({ role: 'user', content: trimmed });
        history.current.push({ role: 'assistant', content: result.answer });
        setEntries(prev => [
          ...prev,
          {
            id: entryId(),
            role: 'assistant',
            content: result.answer,
            sources: result.sources,
            grounded: result.grounded,
            meta: `${result.modelName} · retrieval ${result.retrievalMs} ms · answer ${result.generationMs} ms`,
          },
        ]);
        return result;
      } catch (error) {
        logger.warn('[documentChat] ask failed', error);
        setEntries(prev => [
          ...prev,
          {
            id: entryId(),
            role: 'assistant',
            content: getApiErrorMessage(error as never),
            error: true,
          },
        ]);
        return null;
      }
    },
    [documentChat, documentId, isAsking],
  );

  const reset = useCallback(() => {
    history.current = [];
    setEntries([]);
  }, []);

  return { indexState, indexInfo, indexError, prepare, entries, isAsking, ask, reset };
}
