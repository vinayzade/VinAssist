import {
  getTextRecognitionModule,
  type NativeRecognitionResult,
  type TextRecognitionModule,
} from '@/native';
import { logger } from '@/utils/logger';
import { computeStats } from './ocrStats';
import {
  OCRError,
  type OCRInput,
  type OCROptions,
  type OCRResult,
  type OCRScript,
  type OCRService,
} from './types';

const KNOWN_SCRIPTS: readonly OCRScript[] = ['latin', 'devanagari'];

/** Maps native rejection codes to the service's error codes. */
const NATIVE_CODES: Record<string, OCRError['code']> = {
  E_UNREADABLE: 'unreadable',
  E_UNSUPPORTED_SCRIPT: 'unsupported-script',
  E_RECOGNITION: 'recognition',
};

const MESSAGES: Record<OCRError['code'], string> = {
  unavailable: 'Text recognition is not available on this device.',
  unreadable: 'Could not read that image. Try another photo.',
  'unsupported-script': 'That language is not supported on this device.',
  recognition: 'Text recognition failed. Try a clearer photo.',
  unknown: 'Something went wrong while reading the image.',
};

/**
 * `OCRService` backed by the `TextRecognition` TurboModule, which wraps
 * Google ML Kit Text Recognition v2 on Android. Everything runs on the
 * device; the image never leaves it.
 */
export class MLKitOCRService implements OCRService {
  readonly engine = 'mlkit';

  constructor(
    private readonly module: TextRecognitionModule | null = getTextRecognitionModule(),
  ) {}

  isAvailable(): boolean {
    return this.module !== null;
  }

  supportedScripts(): OCRScript[] {
    if (!this.module) {
      return [];
    }
    try {
      return this.module
        .getSupportedScripts()
        .filter((s): s is OCRScript => (KNOWN_SCRIPTS as string[]).includes(s));
    } catch (error) {
      logger.warn('[ocr] getSupportedScripts failed', error);
      return [];
    }
  }

  async recognize(input: OCRInput, options: OCROptions = {}): Promise<OCRResult> {
    if (!this.module) {
      throw new OCRError(MESSAGES.unavailable, 'unavailable');
    }
    if (!input.uri) {
      throw new OCRError(MESSAGES.unreadable, 'unreadable');
    }

    let raw: NativeRecognitionResult;
    try {
      raw = await this.module.recognize(input.uri, {
        script: options.script ?? 'latin',
      });
    } catch (error) {
      throw toOCRError(error);
    }
    return normalise(raw);
  }
}

function toOCRError(error: unknown): OCRError {
  const nativeCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  const code = NATIVE_CODES[nativeCode] ?? 'unknown';
  logger.warn('[ocr] recognition failed', nativeCode, error);
  return new OCRError(MESSAGES[code], code);
}

/** Cleans up native output: trims text, drops empty lines, adds stats. */
function normalise(raw: NativeRecognitionResult): OCRResult {
  const blocks = (raw.blocks ?? [])
    .map(block => ({
      text: block.text.trim(),
      frame: block.frame,
      language: block.language,
      lines: (block.lines ?? [])
        .map(line => ({
          text: line.text.trim(),
          frame: line.frame,
          confidence: line.confidence,
          language: line.language,
        }))
        .filter(line => line.text.length > 0),
    }))
    .filter(block => block.lines.length > 0);

  // Prefer text rebuilt from the kept lines so it matches `blocks` exactly.
  const text = blocks.map(b => b.lines.map(l => l.text).join('\n')).join('\n\n');

  return {
    text,
    blocks,
    imageWidth: raw.imageWidth,
    imageHeight: raw.imageHeight,
    engine: raw.engine,
    durationMs: raw.durationMs,
    stats: computeStats(blocks, text),
  };
}
