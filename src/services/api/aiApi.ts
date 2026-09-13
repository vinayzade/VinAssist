import { baseApi } from './baseApi';
import { TIMEOUTS } from './config';
import type { ImageInput } from './types';

/* ---------------------------- Backend contract ---------------------------- */

export type ChatRole = 'user' | 'assistant' | 'system';

/* --- Assistant (multimodal, scoped to the user's material) --- */

export type AssistantAttachmentType = 'document' | 'image' | 'ocr' | 'analysis';
export type AnalysisKind = 'image_quality' | 'sentiment' | 'extraction' | 'summary' | 'other';

/**
 * One piece of material for a turn. Documents and images are referenced by
 * their upload id (the file itself goes through `/documents/upload`); OCR
 * text and analysis results are sent inline.
 */
export type AssistantAttachment =
  | { type: 'document'; documentId: string; title?: string }
  | { type: 'image'; documentId: string; title?: string; /** On-device OCR of the image. */ text?: string }
  | { type: 'ocr'; text: string; title?: string }
  | { type: 'analysis'; kind: AnalysisKind; data: Record<string, unknown>; title?: string };

/** Request of `POST /ai/chat`. */
export interface AssistantChatRequest {
  /** Omit to start a new conversation. */
  conversationId?: string;
  /** May be empty when attachments are present. Voice is transcribed on the device. */
  message: string;
  attachments?: AssistantAttachment[];
  inputMode?: 'text' | 'voice';
}

/** Material the conversation currently holds (attachments from every turn). */
export interface AssistantContextItem {
  type: AssistantAttachmentType;
  documentId?: string | null;
  title: string;
  kind?: string | null;
  /** For documents/images: whether passages are available for retrieval. */
  indexed?: boolean | null;
  note?: string | null;
}

export interface AssistantSource {
  chunkId: string;
  documentId: string;
  documentName?: string | null;
  chunkIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  /** Cosine similarity to the question, 0-1. */
  similarity: number;
  /** True when the answer cites this passage as [n]. */
  cited: boolean;
}

/** `no_material`: nothing attached yet; the assistant explained itself without a model call. */
export type AssistantScope = 'material' | 'no_material';

/** Response of `POST /ai/chat`. */
export interface AssistantChatResult {
  conversationId: string;
  messageId: string;
  answer: string;
  sources: AssistantSource[];
  /** False when the answer could not be found in the attached material. */
  grounded: boolean;
  scope: AssistantScope;
  /** Follow-up prompts the app can offer as chips. */
  suggestions: string[];
  context: AssistantContextItem[];
  modelName: string;
  provider: string;
  retrievalMs: number;
  generationMs: number;
  processingMs: number;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  role: ChatRole;
  content: string;
  attachments: AssistantContextItem[];
  sources: AssistantSource[];
  grounded?: boolean | null;
  createdAt: string;
}

export interface AssistantConversation {
  id: string;
  title: string | null;
  messages: AssistantMessage[];
  context: AssistantContextItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AssistantConversationSummary {
  id: string;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
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
    assistantChat: build.mutation<AssistantChatResult, AssistantChatRequest>({
      query: body => ({ url: '/ai/chat', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),

    getConversation: build.query<AssistantConversation, string>({
      query: id => ({ url: `/ai/conversations/${encodeURIComponent(id)}` }),
    }),

    listConversations: build.query<AssistantConversationSummary[], void>({
      query: () => ({ url: '/ai/conversations' }),
    }),

    deleteConversation: build.mutation<void, string>({
      query: id => ({ url: `/ai/conversations/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
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
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),

    summarizeText: build.mutation<SummarizeTextResult, SummarizeTextRequest>({
      query: body => ({ url: '/ai/summarize', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),

    documentChat: build.mutation<DocumentChatResult, DocumentChatRequest>({
      query: body => ({ url: '/ai/document-chat', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
    }),

    extractDocument: build.mutation<ExtractDocumentResult, ExtractDocumentRequest>({
      query: body => ({ url: '/ai/extract', method: 'POST', body }),
      extraOptions: { timeout: TIMEOUTS.ai },
      invalidatesTags: [{ type: 'History', id: 'LIST' }],
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
  useAssistantChatMutation,
  useGetConversationQuery,
  useLazyGetConversationQuery,
  useListConversationsQuery,
  useDeleteConversationMutation,
  useExtractTextMutation,
  useAnalyzeImageMutation,
  useAssessImageQualityMutation,
  useAnalyzeSentimentMutation,
  useSummarizeTextMutation,
  useExtractDocumentMutation,
  useDocumentChatMutation,
  useAnalyzeDocumentImageMutation,
} = aiApi;
