import { useCallback, useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { addHistoryItem } from '@/features/history';
import {
  getApiErrorMessage,
  getErrorStatus,
  useExtractDocumentMutation,
  useSummarizeTextMutation,
  type ExtractDocumentResult,
  type SummarizeTextResult,
  type SummaryMode,
} from '@/services/api';
import { useSaveOcrResultMutation } from '@/services/api/ocrApi';
import type { OCRResult } from '@/services/ocr';
import { useAppDispatch } from '@/store/hooks';
import { logger } from '@/utils/logger';
import { fieldsToText } from '../components/ExtractedFields';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface OcrActions {
  copied: boolean;
  copy: () => void;
  share: () => Promise<void>;
  saveStatus: SaveStatus;
  saveError: string | null;
  save: () => Promise<void>;
  summary: SummarizeTextResult | null;
  isSummarizing: boolean;
  summaryError: string | null;
  /** Runs summarisation in the given mode (defaults to the last used). */
  summarize: (mode?: SummaryMode) => Promise<void>;
  summaryMode: SummaryMode;
  copySummary: () => void;
  extraction: ExtractDocumentResult | null;
  isExtracting: boolean;
  extractionError: string | null;
  /** Classifies the text and extracts typed fields on the backend. */
  extract: () => Promise<void>;
  copyExtraction: () => void;
}

const COPIED_FEEDBACK_MS = 2_000;

/** First non-empty line, trimmed to a title-sized length. */
export function titleFor(text: string, max = 48): string {
  const line = text.split('\n').find(l => l.trim().length > 0)?.trim() ?? '';
  if (!line) {
    return 'Scanned text';
  }
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * The actions available on a recognised result: copy, share, save (local
 * history now, backend when signed in), summarise (backend AI).
 */
export function useOcrActions(result: OCRResult, imageUri: string): OcrActions {
  const dispatch = useAppDispatch();
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummarizeTextResult | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('quick');
  const [extraction, setExtraction] = useState<ExtractDocumentResult | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractDocument, { isLoading: isExtracting }] = useExtractDocumentMutation();
  const [saveRemote] = useSaveOcrResultMutation();
  const [summarizeText, { isLoading: isSummarizing }] = useSummarizeTextMutation();
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );

  const copy = useCallback(() => {
    Clipboard.setString(result.text);
    setCopied(true);
    if (copiedTimer.current) {
      clearTimeout(copiedTimer.current);
    }
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, [result.text]);

  const share = useCallback(async () => {
    try {
      await Share.share({ message: result.text });
    } catch (error) {
      // User dismissed the sheet or no share targets: nothing to surface.
      logger.warn('[ocr] share failed', error);
    }
  }, [result.text]);

  const save = useCallback(async () => {
    if (saveStatus === 'saving' || saveStatus === 'saved') {
      return;
    }
    setSaveStatus('saving');
    setSaveError(null);

    // Local history is the offline-first view and always succeeds.
    dispatch(
      addHistoryItem({
        kind: 'ocr',
        title: titleFor(result.text),
        summary: `${result.stats.wordCount} words · ${result.engine}`,
      }),
    );

    try {
      await saveRemote({
        text: result.text,
        confidence: result.stats.meanConfidence,
        language: result.stats.language,
        engine: result.engine,
        processingMs: Math.round(result.durationMs),
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight,
        sourceUri: imageUri,
      }).unwrap();
      setSaveStatus('saved');
    } catch (error) {
      logger.warn('[ocr] remote save failed', error);
      setSaveStatus('error');
      setSaveError(
        'Saved on this device. Could not sync to your account: ' +
          getApiErrorMessage(error as never),
      );
    }
  }, [dispatch, imageUri, result, saveRemote, saveStatus]);

  const summarize = useCallback(
    async (mode: SummaryMode = summaryMode) => {
      if (isSummarizing) {
        return;
      }
      setSummaryMode(mode);
      setSummaryError(null);
      try {
        const next = await summarizeText({ text: result.text, mode, source: 'ocr' }).unwrap();
        setSummary(next);
      } catch (error) {
        logger.warn('[ocr] summarize failed', error);
        setSummaryError(
          getErrorStatus(error as never) === 404
            ? 'AI summarisation is not available on the backend yet.'
            : getApiErrorMessage(error as never),
        );
      }
    },
    [isSummarizing, result.text, summarizeText, summaryMode],
  );

  const copySummary = useCallback(() => {
    if (!summary) {
      return;
    }
    const text =
      summary.items.length > 0
        ? summary.items.map(item => `• ${item}`).join('\n')
        : summary.summary;
    Clipboard.setString(text);
  }, [summary]);

  const extract = useCallback(async () => {
    if (isExtracting) {
      return;
    }
    setExtractionError(null);
    try {
      const next = await extractDocument({ text: result.text }).unwrap();
      setExtraction(next);
    } catch (error) {
      logger.warn('[ocr] extract failed', error);
      setExtractionError(
        getErrorStatus(error as never) === 404
          ? 'Field extraction is not available on the backend yet.'
          : getApiErrorMessage(error as never),
      );
    }
  }, [extractDocument, isExtracting, result.text]);

  const copyExtraction = useCallback(() => {
    if (extraction) {
      Clipboard.setString(fieldsToText(extraction));
    }
  }, [extraction]);

  return {
    copied,
    copy,
    share,
    saveStatus,
    saveError,
    save,
    summary,
    isSummarizing,
    summaryError,
    summarize,
    summaryMode,
    copySummary,
    extraction,
    isExtracting,
    extractionError,
    extract,
    copyExtraction,
  };
}
