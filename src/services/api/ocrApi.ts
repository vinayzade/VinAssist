import { baseApi } from './baseApi';
import type { PageParams, Paginated } from './types';

/* ---------------------------- Backend contract ---------------------------- */

/**
 * `POST /api/v1/ocr/results`. Recognition happens on the device; only the
 * text and its metadata are stored so results appear in history and can be
 * fed to AI features later. The image is not uploaded.
 */
export interface SaveOcrResultPayload {
  text: string;
  /** 0-1 mean line confidence, when the engine reports one. */
  confidence?: number;
  /** BCP-47 tag, when detected. */
  language?: string;
  /** e.g. "mlkit-latin". */
  engine: string;
  processingMs?: number;
  imageWidth?: number;
  imageHeight?: number;
  /** Local reference only; the backend stores it as an opaque string. */
  sourceUri?: string;
}

export interface OcrResultSummary {
  id: string;
  /** First line of the text, for lists. */
  preview: string;
  wordCount: number;
  confidence: number | null;
  language: string | null;
  engine: string;
  createdAt: string;
}

export interface OcrResultDetail extends OcrResultSummary {
  text: string;
}

/* ------------------------------- Endpoints ------------------------------- */

export const ocrApi = baseApi.injectEndpoints({
  endpoints: build => ({
    saveOcrResult: build.mutation<OcrResultDetail, SaveOcrResultPayload>({
      query: body => ({ url: '/ocr/results', method: 'POST', body }),
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),

    listOcrResults: build.query<Paginated<OcrResultSummary>, PageParams | void>({
      query: params => ({ url: '/ocr/results', params: params ?? undefined }),
      providesTags: [{ type: 'History', id: 'LIST' }],
    }),

    getOcrResult: build.query<OcrResultDetail, string>({
      query: id => `/ocr/results/${encodeURIComponent(id)}`,
    }),
  }),
});

export const {
  useSaveOcrResultMutation,
  useListOcrResultsQuery,
  useGetOcrResultQuery,
} = ocrApi;
