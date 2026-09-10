import { useCallback, useState } from 'react';
import {
  FileSelectionError,
  selectDocument,
  selectImageFromGallery,
  type SelectDocumentOptions,
  type SelectedFile,
} from '@/services/files';
import { logger } from '@/utils/logger';

export interface FileSelection {
  file: SelectedFile | null;
  isSelecting: boolean;
  /** User-facing message from the last failed attempt. */
  error: string | null;
  errorCode: FileSelectionError['code'] | null;
  /** Opens the file browser (PDF + images by default). */
  pickDocument: () => Promise<SelectedFile | null>;
  /** Opens the photo library. */
  pickImage: () => Promise<SelectedFile | null>;
  clear: () => void;
  clearError: () => void;
}

/**
 * Stateful wrapper around the file selection service for screens: keeps
 * the chosen file, a busy flag, and a user-facing error. Selection never
 * uploads anything.
 */
export function useFileSelection(
  options: SelectDocumentOptions = {},
): FileSelection {
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [isSelecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<FileSelectionError['code'] | null>(
    null,
  );

  const run = useCallback(
    async (select: () => Promise<SelectedFile | null>) => {
      if (isSelecting) {
        return null;
      }
      setSelecting(true);
      setError(null);
      setErrorCode(null);
      try {
        const picked = await select();
        if (picked) {
          setFile(picked);
        }
        return picked;
      } catch (err) {
        logger.warn('[files] selection failed', err);
        if (err instanceof FileSelectionError) {
          setError(err.message);
          setErrorCode(err.code);
        } else {
          setError('Could not select the file. Please try again.');
          setErrorCode('unknown');
        }
        return null;
      } finally {
        setSelecting(false);
      }
    },
    [isSelecting],
  );

  return {
    file,
    isSelecting,
    error,
    errorCode,
    pickDocument: useCallback(
      () => run(() => selectDocument(options)),
      [options, run],
    ),
    pickImage: useCallback(
      () => run(() => selectImageFromGallery({ maxSize: options.maxSize })),
      [options.maxSize, run],
    ),
    clear: useCallback(() => setFile(null), []),
    clearError: useCallback(() => {
      setError(null);
      setErrorCode(null);
    }, []),
  };
}
