/**
 * Typed access to the `TextToSpeech` TurboModule. Optional at runtime (null
 * under Jest, on platforms without an implementation, or in a stale build).
 */

import NativeTextToSpeech, {
  type NativeSpeakOptions,
  type Spec as TextToSpeechModule,
} from './specs/NativeTextToSpeech';

export type { NativeSpeakOptions, TextToSpeechModule };

/** `DeviceEventEmitter` event names the native module emits per utterance. */
export const TTS_EVENTS = {
  start: 'TextToSpeech.start',
  done: 'TextToSpeech.done',
} as const;

export function getTextToSpeechModule(): TextToSpeechModule | null {
  return NativeTextToSpeech ?? null;
}
