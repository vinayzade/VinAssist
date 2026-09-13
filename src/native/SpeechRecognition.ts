/**
 * Typed access to the `SpeechRecognition` TurboModule. Optional at runtime
 * (null under Jest, on platforms without an implementation, or in a stale
 * build).
 */

import NativeSpeechRecognition, {
  type NativeSpeechOptions,
  type NativeSpeechResult,
  type Spec as SpeechRecognitionModule,
} from './specs/NativeSpeechRecognition';

export type { NativeSpeechOptions, NativeSpeechResult, SpeechRecognitionModule };

/** `DeviceEventEmitter` event names the native module emits during a session. */
export const SPEECH_EVENTS = {
  partial: 'SpeechRecognition.partial',
  volume: 'SpeechRecognition.volume',
} as const;

export function getSpeechRecognitionModule(): SpeechRecognitionModule | null {
  return NativeSpeechRecognition ?? null;
}
