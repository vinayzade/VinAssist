export type SpeechErrorCode =
  | 'unavailable'
  | 'permission'
  | 'busy'
  | 'network'
  | 'audio'
  | 'cancelled'
  | 'unknown';

export class SpeechError extends Error {
  constructor(message: string, readonly code: SpeechErrorCode) {
    super(message);
    this.name = 'SpeechError';
  }
}

export interface SpeechOptions {
  /** BCP-47 tag such as "en-IN"; device default when omitted. */
  language?: string;
  /** Prefer the offline recogniser when available (default true). */
  preferOffline?: boolean;
}

export interface SpeechListeners {
  /** Live transcript while the user is still speaking. */
  onPartial?: (transcript: string) => void;
  /** Microphone level in dB-ish units from the engine, for a meter. */
  onVolume?: (rms: number) => void;
}

export interface SpeechResult {
  /** Best transcript; empty when nothing was understood. */
  transcript: string;
  alternatives: string[];
  /** 0-1 when reported, otherwise null. */
  confidence: number | null;
  durationMs: number;
}

/**
 * Voice input. Implementations transcribe on the device; the app only ever
 * sees text. One session at a time.
 */
export interface SpeechService {
  readonly engine: string;
  isAvailable(): boolean;
  start(options?: SpeechOptions, listeners?: SpeechListeners): Promise<SpeechResult>;
  /** Ends the session; the pending `start` resolves with what was heard. */
  stop(): void;
  /** Abandons the session; the pending `start` rejects with `cancelled`. */
  cancel(): void;
}

export interface SpeakOptions {
  /** BCP-47 tag such as "en-IN"; device default when omitted. */
  language?: string;
  /** Speech rate multiplier; 1 is normal. */
  rate?: number;
  /** Pitch multiplier; 1 is normal. */
  pitch?: number;
  /** Replace any utterance in progress (default true). */
  interrupt?: boolean;
}

/**
 * Spoken output. Implementations synthesise on the device from text the
 * app already holds; the app never uploads audio for this.
 */
export interface TextToSpeechService {
  readonly engine: string;
  isAvailable(): boolean;
  isSpeaking(): boolean;
  /** Resolves when the utterance has finished; rejects with `cancelled` on stop. */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stop(): void;
}
