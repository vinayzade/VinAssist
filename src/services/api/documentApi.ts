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
  status: DocumentStatus;
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

/* ------------------------------- Endpoints ------------------------------- */

/**
 * `/api/v1/documents/*`. Uploads are multipart; the backend stores the file
 * and runs extraction asynchronously, so `status` is polled via `getDocument`.
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
        body.append('file', file);
        return { url: '/documents', method: 'POST', body };
      },
      extraOptions: { timeout: TIMEOUTS.upload },
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
  useDeleteDocumentMutation,
} = documentApi;
