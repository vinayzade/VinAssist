import { useCallback, useRef, useState } from 'react';
import {
  getImageQualityService,
  ImageQualityError,
  type ImageQualityOptions,
  type ImageQualityResult,
} from '@/services/imageQuality';
import { logger } from '@/utils/logger';

export type ImageQualityStatus = 'idle' | 'analyzing' | 'done' | 'error';

export interface ImageQualityState {
  status: ImageQualityStatus;
  result: ImageQualityResult | null;
  error: string | null;
  isAvailable: boolean;
  /** Analyses `uri`; resolves with the result or null on error. */
  analyze: (uri: string, options?: ImageQualityOptions) => Promise<ImageQualityResult | null>;
  reset: () => void;
}

/** Stateful wrapper around the image quality service for screens. */
export function useImageQuality(): ImageQualityState {
  const service = getImageQualityService();
  const [status, setStatus] = useState<ImageQualityStatus>('idle');
  const [result, setResult] = useState<ImageQualityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const analyze = useCallback(
    async (uri: string, options?: ImageQualityOptions) => {
      const id = ++runId.current;
      setStatus('analyzing');
      setError(null);
      try {
        const next = await service.analyze({ uri }, options);
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
        const message =
          err instanceof ImageQualityError
            ? err.message
            : 'Something went wrong while analysing the image.';
        logger.warn('[imageQuality] failed', err);
        setError(message);
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
  }, []);

  return { status, result, error, isAvailable: service.isAvailable(), analyze, reset };
}
