import type { ActivityKind } from '@/services/api';

export interface ActivityKindMeta {
  label: string;
  /** Short label for filter chips. */
  chip: string;
  glyph: string;
}

export const ACTIVITY_META: Record<ActivityKind, ActivityKindMeta> = {
  ocr: { label: 'Smart OCR', chip: 'OCR', glyph: 'T' },
  document_analysis: { label: 'Document analysis', chip: 'Documents', glyph: '≡' },
  image_analysis: { label: 'Image analysis', chip: 'Images', glyph: '◐' },
  image_quality: { label: 'Image quality', chip: 'Quality', glyph: '◈' },
  sentiment: { label: 'Sentiment', chip: 'Sentiment', glyph: '~' },
  conversation: { label: 'Assistant chat', chip: 'Chats', glyph: '✦' },
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "yesterday", or a short date. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }
  const diff = now.getTime() - then;
  if (diff < MINUTE) {
    return 'just now';
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)} min ago`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)} h ago`;
  }
  if (diff < 2 * DAY) {
    return 'yesterday';
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)} days ago`;
  }
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
