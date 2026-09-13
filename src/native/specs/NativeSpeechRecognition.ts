/**
 * TurboModule spec for on-device speech recognition (voice input).
 *
 * Wraps the platform recogniser (Android `SpeechRecognizer`). Audio never
 * goes through our backend: the device transcribes and only the text is
 * used. Partial transcripts and microphone level are emitted through
 * `DeviceEventEmitter` under the `SPEECH_EVENTS` names while a session is
 * active.
 *
 * Keep the types codegen-compatible: type aliases, no string-literal unions,
 * `Array<T>` for lists, `?` for optional fields.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type NativeSpeechOptions = {
  /** BCP-47 tag such as "en-IN"; the device default when omitted. */
  language?: string;
  /** Emit partial transcripts while the user is still speaking (default true). */
  partialResults?: boolean;
  /** Use the offline recogniser when the platform has one (default true). */
  preferOffline?: boolean;
};

export type NativeSpeechResult = {
  /** Best transcript; empty when nothing was understood. */
  transcript: string;
  /** Alternatives, best first (includes `transcript`). */
  alternatives: Array<string>;
  /** 0-1 when the engine reports it; -1 otherwise. */
  confidence: number;
  durationMs: number;
};

export interface Spec extends TurboModule {
  /** Whether a recognition service exists on this device. */
  isAvailable(): boolean;
  /**
   * Starts listening and resolves with the final result when the user stops
   * speaking or `stop()` is called. Rejects with `E_PERMISSION`,
   * `E_UNAVAILABLE`, `E_BUSY`, `E_NETWORK`, `E_AUDIO`, `E_CANCELLED` or
   * `E_RECOGNITION`. A no-match resolves with an empty transcript.
   */
  start(options: NativeSpeechOptions): Promise<NativeSpeechResult>;
  /** Stops capturing audio; the pending `start` resolves with what was heard. */
  stop(): void;
  /** Abandons the session; the pending `start` rejects with `E_CANCELLED`. */
  cancel(): void;
}

export default TurboModuleRegistry.get<Spec>('SpeechRecognition');
