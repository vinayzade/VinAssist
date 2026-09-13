import type {
  AnalysisKind,
  AssistantContextItem,
  AssistantScope,
  AssistantSource,
} from '@/services/api';
import type { SelectedFile } from '@/services/files';

/**
 * What another screen hands to the assistant tab ("Ask the assistant" on a
 * result screen). Attached as a chip; the user adds a question and sends.
 */
export type AssistantHandoff =
  | { type: 'ocr'; text: string; title?: string }
  | { type: 'analysis'; kind: AnalysisKind; title: string; data: Record<string, unknown> };

/** Material queued in the composer, not yet sent. */
export type PendingAttachment =
  | { id: string; kind: 'file'; file: SelectedFile }
  | { id: string; kind: 'ocr'; title: string; text: string }
  | {
      id: string;
      kind: 'analysis';
      title: string;
      analysisKind: AnalysisKind;
      data: Record<string, unknown>;
    };

/** A compact description of an attachment shown on a sent message. */
export interface AttachmentChipData {
  type: 'document' | 'image' | 'ocr' | 'analysis';
  title: string;
}

export interface AssistantEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachmentChipData[];
  sources?: AssistantSource[];
  grounded?: boolean;
  scope?: AssistantScope;
  /** Provenance line under an answer. */
  meta?: string;
  error?: boolean;
  /** Typed or spoken. */
  inputMode?: 'text' | 'voice';
}

export type AssistantStatus = 'idle' | 'loading' | 'uploading' | 'reading' | 'thinking';

export interface AssistantState {
  conversationId: string | null;
  entries: AssistantEntry[];
  context: AssistantContextItem[];
  suggestions: string[];
  status: AssistantStatus;
  isSending: boolean;
}
