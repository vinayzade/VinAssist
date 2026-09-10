import { useCallback, useState } from 'react';
import { FileSelectionError, selectImageFromGallery } from '@/services/files';
import { logger } from '@/utils/logger';
import type { CapturedImage } from '../types';

export interface GalleryPicker {
  isPicking: boolean;
  error: string | null;
  /** Resolves with the chosen image, or null when cancelled or failed. */
  pick: () => Promise<CapturedImage | null>;
  clearError: () => void;
}

/**
 * Photo-library entry point for the camera flow. Delegates to the shared
 * file selection service so gallery images obey the same size and type
 * rules as documents, then adapts the result to `CapturedImage`.
 */
export function useGalleryPicker(): GalleryPicker {
  const [isPicking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(async () => {
    if (isPicking) {
      return null;
    }
    setPicking(true);
    setError(null);
    try {
      const file = await selectImageFromGallery();
      if (!file) {
        return null;
      }
      return {
        uri: file.uri,
        width: file.width ?? 0,
        height: file.height ?? 0,
        source: 'gallery' as const,
        mimeType: file.mimeType,
      };
    } catch (err) {
      logger.warn('[gallery] pick failed', err);
      setError(
        err instanceof FileSelectionError
          ? err.message
          : 'Could not open your photos. Please try again.',
      );
      return null;
    } finally {
      setPicking(false);
    }
  }, [isPicking]);

  return { isPicking, error, pick, clearError: () => setError(null) };
}
