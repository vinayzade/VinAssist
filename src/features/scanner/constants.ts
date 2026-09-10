import type { ScanTarget } from './types';

export interface ScanTargetOption {
  route: ScanTarget;
  label: string;
  description: string;
  glyph: string;
}

/** The tools a captured image can be sent to, in display order. */
export const SCAN_TARGETS: ScanTargetOption[] = [
  {
    route: 'OCR',
    label: 'Smart OCR',
    description: 'Extract editable text',
    glyph: 'T',
  },
  {
    route: 'DocumentAnalysis',
    label: 'Document Summary',
    description: 'Summarise and pull out key points',
    glyph: '≡',
  },
  {
    route: 'ImageAnalysis',
    label: 'Image Analysis',
    description: 'Describe what is in the photo',
    glyph: '◐',
  },
  {
    route: 'ImageQuality',
    label: 'Image Quality',
    description: 'Check blur, exposure and sharpness',
    glyph: '◈',
  },
];

export const SCAN_TARGET_LABELS: Record<ScanTarget, string> =
  Object.fromEntries(SCAN_TARGETS.map(t => [t.route, t.label])) as Record<
    ScanTarget,
    string
  >;
