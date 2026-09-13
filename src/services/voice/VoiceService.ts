import type { SpeechService, TextToSpeechService } from '@/services/speech';
import type {
  SpeakOptions,
  SpeechListeners,
  SpeechOptions,
  SpeechResult,
  VoiceService,
} from './types';

/**
 * Default `VoiceService`: a recogniser plus a synthesiser. Speaking is
 * stopped before listening starts so the microphone does not pick up the
 * device's own voice, and listening is cancelled before speaking. The
 * halves are resolved lazily so either can be swapped (tests, platforms).
 */
export class ComposedVoiceService implements VoiceService {
  constructor(
    private readonly getRecognizer: () => SpeechService,
    private readonly getSynthesizer: () => TextToSpeechService,
  ) {}

  private get recognizer(): SpeechService {
    return this.getRecognizer();
  }

  private get synthesizer(): TextToSpeechService {
    return this.getSynthesizer();
  }

  canListen(): boolean {
    return this.recognizer.isAvailable();
  }

  canSpeak(): boolean {
    return this.synthesizer.isAvailable();
  }

  listen(options?: SpeechOptions, listeners?: SpeechListeners): Promise<SpeechResult> {
    this.synthesizer.stop();
    return this.recognizer.start(options, listeners);
  }

  stopListening(): void {
    this.recognizer.stop();
  }

  cancelListening(): void {
    this.recognizer.cancel();
  }

  speak(text: string, options?: SpeakOptions): Promise<void> {
    this.recognizer.cancel();
    return this.synthesizer.speak(text, options);
  }

  stopSpeaking(): void {
    this.synthesizer.stop();
  }

  isSpeaking(): boolean {
    return this.synthesizer.isSpeaking();
  }

  stopAll(): void {
    this.recognizer.cancel();
    this.synthesizer.stop();
  }
}
