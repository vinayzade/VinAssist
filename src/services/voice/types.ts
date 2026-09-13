import type {
  SpeakOptions,
  SpeechListeners,
  SpeechOptions,
  SpeechResult,
} from '@/services/speech';

export type { SpeakOptions, SpeechListeners, SpeechOptions, SpeechResult };

/**
 * The voice layer of the app: turning speech into text and text into
 * speech. It deliberately knows nothing about the assistant or any LLM;
 * a feature hook wires `listen()` -> assistant -> `speak()` together.
 * Both halves run on the device, so audio never leaves the phone.
 */
export interface VoiceService {
  /** Whether speech recognition is available on this device/build. */
  canListen(): boolean;
  /** Whether text-to-speech is available on this device/build. */
  canSpeak(): boolean;

  /** Speech-to-text. Resolves with the final transcript (may be empty). */
  listen(options?: SpeechOptions, listeners?: SpeechListeners): Promise<SpeechResult>;
  /** Ends listening; the pending `listen` resolves with what was heard. */
  stopListening(): void;
  /** Abandons listening; the pending `listen` rejects with `cancelled`. */
  cancelListening(): void;

  /** Text-to-speech. Resolves when the utterance finishes. */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stopSpeaking(): void;
  isSpeaking(): boolean;

  /** Stops both directions (leaving a screen, an interruption). */
  stopAll(): void;
}
