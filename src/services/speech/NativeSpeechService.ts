import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';
import { getSpeechRecognitionModule, SPEECH_EVENTS } from '@/native';
import {
  SpeechError,
  type SpeechErrorCode,
  type SpeechListeners,
  type SpeechOptions,
  type SpeechResult,
  type SpeechService,
} from './types';

const CODE_MAP: Record<string, SpeechErrorCode> = {
  E_UNAVAILABLE: 'unavailable',
  E_PERMISSION: 'permission',
  E_BUSY: 'busy',
  E_NETWORK: 'network',
  E_AUDIO: 'audio',
  E_CANCELLED: 'cancelled',
  E_RECOGNITION: 'unknown',
};

function toSpeechError(error: unknown): SpeechError {
  const code = (error as { code?: string } | null)?.code ?? '';
  const message =
    error instanceof Error && error.message
      ? error.message
      : 'Speech recognition failed.';
  return new SpeechError(message, CODE_MAP[code] ?? 'unknown');
}

/** Platform recogniser through the `SpeechRecognition` TurboModule. */
export class NativeSpeechService implements SpeechService {
  readonly engine = 'platform';
  private subscriptions: EmitterSubscription[] = [];

  isAvailable(): boolean {
    const module = getSpeechRecognitionModule();
    try {
      return Boolean(module?.isAvailable());
    } catch {
      return false;
    }
  }

  async start(
    options: SpeechOptions = {},
    listeners: SpeechListeners = {},
  ): Promise<SpeechResult> {
    const module = getSpeechRecognitionModule();
    if (!module) {
      throw new SpeechError(
        'Voice input is not available in this build.',
        'unavailable',
      );
    }
    this.unsubscribe();
    if (listeners.onPartial) {
      const onPartial = listeners.onPartial;
      this.subscriptions.push(
        DeviceEventEmitter.addListener(
          SPEECH_EVENTS.partial,
          (event: { transcript: string }) => onPartial(event.transcript),
        ),
      );
    }
    if (listeners.onVolume) {
      const onVolume = listeners.onVolume;
      this.subscriptions.push(
        DeviceEventEmitter.addListener(
          SPEECH_EVENTS.volume,
          (event: { rms: number }) => onVolume(event.rms),
        ),
      );
    }
    try {
      const result = await module.start({
        language: options.language,
        preferOffline: options.preferOffline ?? true,
        partialResults: Boolean(listeners.onPartial),
      });
      return {
        transcript: result.transcript.trim(),
        alternatives: result.alternatives,
        confidence: result.confidence >= 0 ? result.confidence : null,
        durationMs: result.durationMs,
      };
    } catch (error) {
      throw toSpeechError(error);
    } finally {
      this.unsubscribe();
    }
  }

  stop(): void {
    getSpeechRecognitionModule()?.stop();
  }

  cancel(): void {
    getSpeechRecognitionModule()?.cancel();
  }

  private unsubscribe() {
    for (const subscription of this.subscriptions.splice(0)) {
      subscription.remove();
    }
  }
}
