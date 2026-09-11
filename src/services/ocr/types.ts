/** Scripts the app can ask for. Availability depends on the engine build. */
export type OCRScript = 'latin' | 'devanagari';

export interface OCRRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OCRLine {
  text: string;
  frame: OCRRect;
  /** 0-1 when the engine reports it. */
  confidence?: number;
  /** BCP-47 tag when detected, e.g. "en", "hi". */
  language?: string;
}

export interface OCRBlock {
  text: string;
  frame: OCRRect;
  lines: OCRLine[];
  language?: string;
}

export interface OCRResult {
  /** Full text, blocks separated by blank lines. Never null; may be "". */
  text: string;
  blocks: OCRBlock[];
  /** Image size as analysed (after EXIF rotation), for overlaying frames. */
  imageWidth: number;
  imageHeight: number;
  /** Engine identifier, e.g. "mlkit-latin". */
  engine: string;
  durationMs: number;
  /** Derived: total lines and words, mean line confidence when available. */
  stats: OCRStats;
}

export interface OCRStats {
  lineCount: number;
  wordCount: number;
  /** 0-1, undefined when the engine reports no confidences. */
  meanConfidence?: number;
  /** Most frequent detected language, if any. */
  language?: string;
}

export interface OCRInput {
  /** `file://`, `content://` or absolute path of an image on this device. */
  uri: string;
}

export interface OCROptions {
  /** Defaults to `latin`. */
  script?: OCRScript;
}

export type OCRErrorCode =
  | 'unavailable'
  | 'unreadable'
  | 'unsupported-script'
  | 'recognition'
  | 'unknown';

export class OCRError extends Error {
  constructor(message: string, readonly code: OCRErrorCode) {
    super(message);
    this.name = 'OCRError';
  }
}

/**
 * What every OCR engine must provide. Feature code depends only on this,
 * so the engine (ML Kit today) can be swapped without touching screens.
 */
export interface OCRService {
  /** Stable engine name for logging and history, e.g. "mlkit". */
  readonly engine: string;
  /** False when the native side is missing on this platform or build. */
  isAvailable(): boolean;
  /** Scripts this engine can recognise on this device. */
  supportedScripts(): OCRScript[];
  /** Runs recognition. Rejects with `OCRError`; never throws anything else. */
  recognize(input: OCRInput, options?: OCROptions): Promise<OCRResult>;
}
