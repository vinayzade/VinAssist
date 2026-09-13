/**
 * Speech services: recognition (speech-to-text) and synthesis
 * (text-to-speech). `get*Service()` returns the platform-backed
 * implementation; tests and other platforms can swap it with
 * `set*Service()`. Neither knows anything about the assistant or the LLM;
 * `services/voice` composes them into a `VoiceService`.
 */

import { NativeSpeechService } from './NativeSpeechService';
import { NativeTextToSpeechService } from './NativeTextToSpeechService';
import type { SpeechService, TextToSpeechService } from './types';

export * from './types';
export { NativeSpeechService } from './NativeSpeechService';
export { NativeTextToSpeechService } from './NativeTextToSpeechService';

let current: SpeechService | null = null;

export function getSpeechService(): SpeechService {
  if (!current) {
    current = new NativeSpeechService();
  }
  return current;
}

/** Replace the implementation (pass null to restore the default). */
export function setSpeechService(service: SpeechService | null): void {
  current = service;
}

let currentTts: TextToSpeechService | null = null;

export function getTextToSpeechService(): TextToSpeechService {
  if (!currentTts) {
    currentTts = new NativeTextToSpeechService();
  }
  return currentTts;
}

/** Replace the implementation (pass null to restore the default). */
export function setTextToSpeechService(service: TextToSpeechService | null): void {
  currentTts = service;
}
