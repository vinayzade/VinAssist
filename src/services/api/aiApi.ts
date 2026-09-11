import { baseApi } from './baseApi';
import { TIMEOUTS } from './config';
import type { ImageInput } from './types';

/* ---------------------------- Backend contract ---------------------------- */

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Optional server-side conversation id for continuity. */
  conversationId?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  conversationId?: string;
}

export interface OcrResponse {
  text: string;
  /** 0-1 average recognition confidence, when the model reports it. */
  confidence?: number;
}

export interface VisionRequest {
  image: ImageInput;
  prompt?: string;
}

export interface VisionResponse {
  result: string;
}

export type SentimentLabel = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

/** Response of `POST /ai/sentiment`. */
export interface SentimentResult {
  sentiment: SentimentLabel;
  /** 0-1 confidence in `sentiment`. */
  confidence: number;
  explanation?: string | null;
  /** Per-label probabilities when the model exposes them. */
  scores?: Record<string, number>;
  id: string;
  /** Which backend provider/model answered; never a vendor credential. */
  provider: string;
  model: string;
  processingMs: number;
  createdAt: string;
}

export interface ImageQualityResult {
  /** 0-100 overall score. */
  score: number;
  blur: 'none' | 'slight' | 'heavy';
  exposure: 'under' | 'good' | 'over';
  issues: string[];
}

export interface DocumentAnalysisResult {
  summary: string;
  keyPoints: string[];
  documentType?: string;
}

export type SummaryMode = 'quick' | 'detailed' | 'bullet_points' | 'action_items';

/** Request of `POST /ai/summarize`. */
export interface SummarizeTextRequest {
  text: string;
  /** Defaults to `quick` on the server. */
  mode?: SummaryMode;
  /** Hint for the model, e.g. "ocr" so it tolerates recognition noise. */
  source?: 'ocr' | 'document' | 'chat';
}

/** Response of `POST /ai/summarize`. */
export interface SummarizeTextResult {
  /** Prose for `quick` / `detailed`; a one-line lead-in for list modes. */
  summary: string;
  /** Bullet or action items for list modes; empty otherwise. */
  items: string[];
  mode: SummaryMode;
  documentType?: string | null;
  processingMs: number;
  modelName: string;
  provider: string;
  createdAt: string;
}

export type DocumentClass =
  | 'BUSINESS_CARD'
  | 'RESUME'
  | 'INVOICE'
  | 'RECEIPT'
  | 'GENERIC';

/** Request of `POST /ai/extract`. */
export interface ExtractDocumentRequest {
  text: string;
  /** Skip classification and extract as this type. */
  documentType?: DocumentClass;
}

/**
 * Response of `POST /ai/extract`. `data` is validated by the backend against
 * the schema for `documentType`; unknown values are null, never invented.
 */
export interface ExtractDocumentResult {
  documentType: DocumentClass;
  /** 0-1 confidence in the classification; 1 when the type was given. */
  confidence: number;
  data: Record<string, unknown>;
  scores?: Record<string, number>;
  /** Fields the backend dropped or could not verify, in plain language. */
  warnings: string[];
  /** Share of fields that were populated, 0-1. */
  completeness: number;
  processingMs: number;
  modelName: string;
  provider: string;
  createdAt: string;
}

export interface DocumentChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Request of `POST /ai/document-chat`. */
export interface DocumentChatRequest {
  documentId: string;
  question: string;
  /** Previous turns for follow-ups; the current question goes last. */
  history?: DocumentChatTurn[];
}

export interface SourceChunk {
  chunkId: string;
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  /** Cosine similarity to the question, 0-1. */
  similarity: number;
  /** True when the answer cites this passage as [n]. */
  cited: boolean;
}

/** Response of `POST /ai/document-chat`. */
export interface DocumentChatResult {
  documentId: string;
  question: string;
  answer: string;
  sources: SourceChunk[];
  grounded: boolean;
  modelName: string;
  provider: string;
  retrievalMs: number;
  generationMs: number;
  processingMs: number;
  createdAt: string;
}

/* ------------------------------- Endpoints ------------------------------- */

/**
 * `/api/v1/ai/*`. The backend owns every model call and every provider key;
 * the app only ever sends user content and receives structured results.
 * All calls are mutations (non-idempotent, never cached, never auto-retried)
 * with the long `ai` timeout.
 */
export const aiApi = baseApi.injectEndpoints({
  endpoints: build => ({
    chat: build.mutation<ChatResponse, ChatRequest>({
      query: body => ({ url: '/ai/chat', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    extractText: build.mutation<OcrResponse, ImageInput>({
      query: image => ({ url: '/ai/ocr', method: 'POST', body: { image } }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    analyzeImage: build.mutation<VisionResponse, VisionRequest>({
      query: body => ({ url: '/ai/vision', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    assessImageQuality: build.mutation<ImageQualityResult, ImageInput>({
      query: image => ({
        url: '/ai/image-quality',
        method: 'POST',
        body: { image },
      }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    analyzeSentiment: build.mutation<SentimentResult, { text: string }>({
      query: body => ({ url: '/ai/sentiment', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    summarizeText: build.mutation<SummarizeTextResult, SummarizeTextRequest>({
      query: body => ({ url: '/ai/summarize', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    documentChat: build.mutation<DocumentChatResult, DocumentChatRequest>({
      query: body => ({ url: '/ai/document-chat', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    extractDocument: build.mutation<ExtractDocumentResult, ExtractDocumentRequest>({
      query: body => ({ url: '/ai/extract', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),

    analyzeDocumentImage: build.mutation<DocumentAnalysisResult, ImageInput>({
      query: image => ({
        url: '/ai/document',
        method: 'POST',
        body: { image },
      }),
      extraOptions: { timeout: TIMEOUTS.ai },
    }),
  }),
});

export const {
  useChatMutation,
  useExtractTextMutation,
  useAnalyzeImageMutation,
  useAssessImageQualityMutation,
  useAnalyzeSentimentMutation,
  useSummarizeTextMutation,
  useExtractDocumentMutation,
  useDocumentChatMutation,
  useAnalyzeDocumentImageMutation,
} = aiApi;
