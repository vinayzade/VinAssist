import { useCallback, useRef, useState } from 'react';
import {
  getOCRService,
  OCRError,
  type OCROptions,
  type OCRResult,
} from '@/services/ocr';
import { logger } from '@/utils/logger';

export type OcrStatus = 'idle' | 'recognizing' | 'done' | 'error';

export interface OcrState {
  status: OcrStatus;
  result: OCRResult | null;
  error: string | null;
  errorCode: OCRError['code'] | null;
  isAvailable: boolean;
  /** Runs recognition on `uri`. Resolves with the result, or null on error. */
  recognize: (uri: string, options?: OCROptions) => Promise<OCRResult | null>;
  reset: () => void;
}

/**
 * Stateful wrapper around the OCR service for screens. Ignores results
 * from a run that was superseded (user picked another image mid-flight) and
 * from a run that finished after unmount.
 */
export function useOcr(): OcrState {
  const service = getOCRService();
  const [status, setStatus] = useState<OcrStatus>('idle');
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<OCRError['code'] | null>(null);
  const runId = useRef(0);

  const recognize = useCallback(
    async (uri: string, options?: OCROptions) => {
      const id = ++runId.current;
      setStatus('recognizing');
      setError(null);
      setErrorCode(null);
      try {
        const next = await service.recognize({ uri }, options);
        if (id !== runId.current) {
          return null;
        }
        setResult(next);
        setStatus('done');
        return next;
      } catch (err) {
        if (id !== runId.current) {
          return null;
        }
        const ocrError =
          err instanceof OCRError
            ? err
            : new OCRError('Something went wrong while reading the image.', 'unknown');
        logger.warn('[ocr] failed', ocrError.code, err);
        setError(ocrError.message);
        setErrorCode(ocrError.code);
        setStatus('error');
        return null;
      }
    },
    [service],
  );

  const reset = useCallback(() => {
    runId.current += 1;
    setStatus('idle');
    setResult(null);
    setError(null);
    setErrorCode(null);
  }, []);

  return {
    status,
    result,
    error,
    errorCode,
    isAvailable: service.isAvailable(),
    recognize,
    reset,
  };
}
