import { useCallback, useState } from 'react';
import {
  getApiErrorMessage,
  getErrorStatus,
  useUploadDocumentMutation,
  type DocumentSummary,
} from '@/services/api';
import type { SelectedFile } from '@/services/files';
import { logger } from '@/utils/logger';

export type UploadStatus = 'idle' | 'uploading' | 'uploaded' | 'error';

export interface DocumentUpload {
  status: UploadStatus;
  document: DocumentSummary | null;
  error: string | null;
  /** Uploads a validated local file. Resolves with the server record or null. */
  upload: (file: SelectedFile) => Promise<DocumentSummary | null>;
  reset: () => void;
}

/** Messages for the backend's validation codes, phrased for the user. */
function messageFor(error: unknown): string {
  const status = getErrorStatus(error as never);
  switch (status) {
    case 413:
      return 'That file is larger than the server allows.';
    case 415:
      return 'The server does not accept that file type.';
    case 400:
      return `The server rejected the file: ${getApiErrorMessage(error as never)}`;
    case 401:
      return 'Sign in again to upload documents.';
    default:
      return getApiErrorMessage(error as never);
  }
}

/**
 * Sends a locally validated file to `POST /api/v1/documents/upload` as
 * multipart form data. The bearer token is attached by the API layer.
 */
export function useDocumentUpload(): DocumentUpload {
  const [uploadDocument] = useUploadDocumentMutation();
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [document, setDocument] = useState<DocumentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (file: SelectedFile) => {
      if (status === 'uploading') {
        return null;
      }
      setStatus('uploading');
      setError(null);
      try {
        const result = await uploadDocument({
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
        }).unwrap();
        setDocument(result);
        setStatus('uploaded');
        return result;
      } catch (err) {
        logger.warn('[documents] upload failed', err);
        setError(messageFor(err));
        setStatus('error');
        return null;
      }
    },
    [status, uploadDocument],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setDocument(null);
    setError(null);
  }, []);

  return { status, document, error, upload, reset };
}
