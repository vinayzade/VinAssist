import { getTextToSpeechModule } from '@/native';
import {
  SpeechError,
  type SpeakOptions,
  type SpeechErrorCode,
  type TextToSpeechService,
} from './types';

const CODE_MAP: Record<string, SpeechErrorCode> = {
  E_UNAVAILABLE: 'unavailable',
  E_LANGUAGE: 'unavailable',
  E_CANCELLED: 'cancelled',
  E_SYNTHESIS: 'unknown',
};

function toSpeechError(error: unknown): SpeechError {
  const code = (error as { code?: string } | null)?.code ?? '';
  const message =
    error instanceof Error && error.message ? error.message : 'Text-to-speech failed.';
  return new SpeechError(message, CODE_MAP[code] ?? 'unknown');
}

/** Platform synthesiser through the `TextToSpeech` TurboModule. */
export class NativeTextToSpeechService implements TextToSpeechService {
  readonly engine = 'platform';

  isAvailable(): boolean {
    const module = getTextToSpeechModule();
    try {
      return Boolean(module?.isAvailable());
    } catch {
      return false;
    }
  }

  isSpeaking(): boolean {
    try {
      return Boolean(getTextToSpeechModule()?.isSpeaking());
    } catch {
      return false;
    }
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const module = getTextToSpeechModule();
    if (!module) {
      throw new SpeechError('Spoken replies are not available in this build.', 'unavailable');
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    try {
      await module.speak(trimmed, {
        language: options.language,
        rate: options.rate,
        pitch: options.pitch,
        interrupt: options.interrupt ?? true,
      });
    } catch (error) {
      throw toSpeechError(error);
    }
  }

  stop(): void {
    getTextToSpeechModule()?.stop();
  }
}
