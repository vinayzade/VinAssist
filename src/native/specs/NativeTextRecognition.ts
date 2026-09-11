/**
 * TurboModule spec for on-device text recognition.
 *
 * Codegen reads this file (see `codegenConfig` in package.json) and emits
 * `NativeTextRecognitionSpec` for Android (Kotlin/Java) and iOS. Keep the
 * types codegen-compatible: type aliases (not interfaces), no string-literal
 * unions, `Array<T>` for lists, and `?` for optional fields.
 *
 * Feature code must not import this directly; use `@/native` or the OCR
 * service, which add validation, fallbacks and a stable API.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type NativeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeTextLine = {
  text: string;
  frame: NativeRect;
  /** 0-1 when the engine reports it. */
  confidence?: number;
  /** BCP-47 tag when detected, e.g. "en", "hi". */
  language?: string;
};

export type NativeTextBlock = {
  text: string;
  frame: NativeRect;
  lines: Array<NativeTextLine>;
  language?: string;
};

export type NativeRecognitionResult = {
  /** Full text with blocks separated by blank lines. */
  text: string;
  blocks: Array<NativeTextBlock>;
  /** Pixel size of the image as it was analysed (after EXIF rotation). */
  imageWidth: number;
  imageHeight: number;
  /** Engine identifier, e.g. "mlkit-latin". */
  engine: string;
  durationMs: number;
};

export type NativeRecognitionOptions = {
  /** Script model to use: "latin" (default) or "devanagari". */
  script?: string;
};

export interface Spec extends TurboModule {
  /** Scripts this build can recognise, e.g. ["latin", "devanagari"]. */
  getSupportedScripts(): Array<string>;
  /**
   * Recognises text in the image at `uri` (file://, content:// or a plain
   * path). Rejects with code `E_UNREADABLE` when the image cannot be
   * decoded, `E_UNSUPPORTED_SCRIPT`, or `E_RECOGNITION` for engine errors.
   */
  recognize(
    uri: string,
    options: NativeRecognitionOptions,
  ): Promise<NativeRecognitionResult>;
}

export default TurboModuleRegistry.get<Spec>('TextRecognition');
