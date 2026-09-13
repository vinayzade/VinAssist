/**
 * Voice layer: `getVoiceService()` returns the device-backed implementation
 * (platform speech recogniser + platform text-to-speech). Tests and other
 * platforms swap it with `setVoiceService()`.
 */

import { getSpeechService, getTextToSpeechService } from '@/services/speech';
import { ComposedVoiceService } from './VoiceService';
import type { VoiceService } from './types';

export * from './types';
export { ComposedVoiceService } from './VoiceService';
export { ensureMicrophonePermission } from './permissions';

let current: VoiceService | null = null;

export function getVoiceService(): VoiceService {
  if (!current) {
    current = new ComposedVoiceService(getSpeechService, getTextToSpeechService);
  }
  return current;
}

/** Replace the implementation (pass null to restore the default). */
export function setVoiceService(service: VoiceService | null): void {
  current = service;
}
