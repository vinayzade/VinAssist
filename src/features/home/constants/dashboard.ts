import type { ActivityKindMap, DashboardAction } from '../types';

/** Big tiles at the top: the four things people do most. */
export const QUICK_ACTIONS: DashboardAction[] = [
  {
    id: 'scan-document',
    title: 'Scan Document',
    glyph: '▣',
    route: 'Scanner',
    tone: 'primary',
  },
  {
    id: 'analyze-image',
    title: 'Analyze Image',
    glyph: '◐',
    route: 'ImageAnalysis',
    tone: 'accent',
  },
  {
    id: 'ask-ai',
    title: 'Ask AI',
    glyph: '✦',
    route: 'AIAssistant',
    tone: 'info',
  },
  {
    id: 'voice-assistant',
    title: 'Voice Assistant',
    glyph: '●',
    route: 'Voice',
    tone: 'success',
  },
];

/** Specialised tools, listed with a one-line description. */
export const AI_TOOLS: DashboardAction[] = [
  {
    id: 'smart-ocr',
    title: 'Smart OCR',
    description: 'Extract editable text from photos and scans',
    glyph: 'T',
    route: 'OCR',
  },
  {
    id: 'document-summary',
    title: 'Document Summary',
    description: 'Condense long documents into key points',
    glyph: '≡',
    route: 'DocumentAnalysis',
  },
  {
    id: 'image-quality',
    title: 'Image Quality',
    description: 'Check blur, exposure and sharpness',
    glyph: '◈',
    route: 'ImageQuality',
  },
  {
    id: 'sentiment-analysis',
    title: 'Sentiment Analysis',
    description: 'Detect the tone of any text',
    glyph: '~',
    route: 'Sentiment',
  },
];

/** How each history kind is presented in Recent Activity. */
export const ACTIVITY_KINDS: ActivityKindMap = {
  ocr: { label: 'Smart OCR', glyph: 'T', route: 'OCR' },
  document_analysis: {
    label: 'Document analysis',
    glyph: '≡',
    route: 'DocumentAnalysis',
  },
  image_analysis: {
    label: 'Image analysis',
    glyph: '◐',
    route: 'ImageAnalysis',
  },
  image_quality: { label: 'Image Quality', glyph: '◈', route: 'ImageQuality' },
  sentiment: { label: 'Sentiment', glyph: '~', route: 'Sentiment' },
  conversation: { label: 'Assistant chat', glyph: '✦', route: 'AIAssistant' },
};

/** How many history items the dashboard previews. */
export const RECENT_ACTIVITY_LIMIT = 5;
