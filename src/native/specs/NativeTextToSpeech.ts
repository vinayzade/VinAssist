/**
 * TurboModule spec for on-device text-to-speech.
 *
 * Wraps the platform synthesiser (Android `TextToSpeech`). Speech is
 * generated on the device from text the app already has; nothing is sent
 * to our backend for this step. Start/finish notifications for an
 * utterance arrive through `DeviceEventEmitter` (see `TTS_EVENTS` in
 * `../TextToSpeech.ts`).
 *
 * Keep the types codegen-compatible: type aliases, no string-literal unions,
 * `Array<T>` for lists, `?` for optional fields.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type NativeSpeakOptions = {
  /** BCP-47 tag such as "en-IN"; the device default when omitted. */
  language?: string;
  /** Speech rate multiplier; 1 is normal. */
  rate?: number;
  /** Pitch multiplier; 1 is normal. */
  pitch?: number;
  /** Replace any utterance in progress (default true) instead of queueing. */
  interrupt?: boolean;
};

export interface Spec extends TurboModule {
  /** Whether a speech engine exists on this device. */
  isAvailable(): boolean;
  /** True while an utterance is being spoken. */
  isSpeaking(): boolean;
  /**
   * Speaks `text` and resolves when the utterance finishes. Rejects with
   * `E_UNAVAILABLE`, `E_LANGUAGE`, `E_CANCELLED` or `E_SYNTHESIS`.
   */
  speak(text: string, options: NativeSpeakOptions): Promise<void>;
  /** Stops speaking; the pending `speak` rejects with `E_CANCELLED`. */
  stop(): void;
}

export default TurboModuleRegistry.get<Spec>('TextToSpeech');
