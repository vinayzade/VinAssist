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

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface SentimentResult {
  label: SentimentLabel;
  /** 0-1 confidence. */
  confidence: number;
  explanation: string;
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
  useAnalyzeDocumentImageMutation,
} = aiApi;
