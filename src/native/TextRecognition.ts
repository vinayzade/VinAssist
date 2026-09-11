/**
 * Typed access to the `TextRecognition` TurboModule.
 *
 * The module is optional at runtime: it is absent under Jest, on platforms
 * where it has not been implemented yet, and in a stale native build. Every
 * consumer must go through `getTextRecognitionModule()` and handle `null`.
 */

import NativeTextRecognition, {
  type NativeRecognitionOptions,
  type NativeRecognitionResult,
  type NativeTextBlock,
  type NativeTextLine,
  type NativeRect,
  type Spec as TextRecognitionModule,
} from './specs/NativeTextRecognition';

export type {
  NativeRecognitionOptions,
  NativeRecognitionResult,
  NativeTextBlock,
  NativeTextLine,
  NativeRect,
  TextRecognitionModule,
};

export function getTextRecognitionModule(): TextRecognitionModule | null {
  return NativeTextRecognition ?? null;
}
