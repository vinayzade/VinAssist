import { baseApi } from './baseApi';
import { TIMEOUTS } from './config';
import type { PageParams, Paginated, UploadFile } from './types';

/* ---------------------------- Backend contract ---------------------------- */

export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface DocumentSummary {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: 'pdf' | 'image';
  status: DocumentStatus;
  /** Hex SHA-256 of the stored bytes, computed by the backend. */
  sha256: string | null;
  createdAt: string;
}

export interface DocumentAnalysis {
  summary: string;
  keyPoints: string[];
  documentType?: string;
}

export interface DocumentDetail extends DocumentSummary {
  /** Extracted text, once processing has finished. */
  text?: string;
  analysis?: DocumentAnalysis;
}

export interface IndexDocumentPayload {
  id: string;
  /** Text from on-device OCR; omit to use the PDF's own text layer. */
  text?: string;
  force?: boolean;
}

/** Response of `POST /documents/{id}/index`. */
export interface IndexDocumentResult {
  documentId: string;
  chunkCount: number;
  characters: number;
  embeddingModel: string;
  processingMs: number;
}

/* ------------------------------- Endpoints ------------------------------- */

/**
 * `/api/v1/documents/*`. Uploads are multipart to `/documents/upload`; the
 * backend validates MIME, extension, real content and size, stores the bytes
 * outside the database and returns the metadata row. Extraction runs
 * asynchronously later, so `status` is polled via `getDocument`.
 */
export const documentApi = baseApi.injectEndpoints({
  endpoints: build => ({
    listDocuments: build.query<Paginated<DocumentSummary>, PageParams | void>({
      query: params => ({ url: '/documents', params: params ?? undefined }),
      providesTags: result =>
        result
          ? [
              ...result.items.map(d => ({
                type: 'Document' as const,
                id: d.id,
              })),
              { type: 'Document' as const, id: 'LIST' },
            ]
          : [{ type: 'Document' as const, id: 'LIST' }],
    }),

    getDocument: build.query<DocumentDetail, string>({
      query: id => `/documents/${encodeURIComponent(id)}`,
      providesTags: (_result, _error, id) => [{ type: 'Document', id }],
    }),

    uploadDocument: build.mutation<DocumentSummary, UploadFile>({
      query: file => {
        const body = new FormData();
        // React Native's FormData sends {uri, name, type} as a file part.
        body.append('file', file as unknown as Blob);
        return { url: '/documents/upload', method: 'POST', body };
      },
      extraOptions: { timeout: TIMEOUTS.upload, maxRetries: 0 },
      invalidatesTags: [{ type: 'Document', id: 'LIST' }],
    }),

    analyzeDocument: build.mutation<DocumentDetail, string>({
      query: id => ({
        url: `/documents/${encodeURIComponent(id)}/analyze`,
        method: 'POST',
      }),
      extraOptions: { timeout: TIMEOUTS.ai },
      invalidatesTags: (_result, _error, id) => [{ type: 'Document', id }],
    }),

    /** Chunks and embeds the document so it can be chatted with. */
    indexDocument: build.mutation<IndexDocumentResult, IndexDocumentPayload>({
      query: ({ id, ...body }) => ({
        url: `/documents/${encodeURIComponent(id)}/index`,
        method: 'POST',
        body,
      }),
      extraOptions: { timeout: TIMEOUTS.ai, maxRetries: 0 },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Document', id }],
    }),

    deleteDocument: build.mutation<void, string>({
      query: id => ({
        url: `/documents/${encodeURIComponent(id)}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'Document', id },
        { type: 'Document', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useListDocumentsQuery,
  useGetDocumentQuery,
  useLazyGetDocumentQuery,
  useUploadDocumentMutation,
  useAnalyzeDocumentMutation,
  useIndexDocumentMutation,
  useDeleteDocumentMutation,
} = documentApi;
