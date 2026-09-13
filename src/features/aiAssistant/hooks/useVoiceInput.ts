import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechError } from '@/services/speech';
import { ensureMicrophonePermission, getVoiceService } from '@/services/voice';
import { logger } from '@/utils/logger';

export type VoiceStatus = 'idle' | 'listening' | 'processing';

export interface VoiceInput {
  /** False when the build or device has no recogniser; hide the mic. */
  isAvailable: boolean;
  status: VoiceStatus;
  /** Live transcript while listening. */
  partial: string;
  /** User-facing message from the last failure. */
  error: string | null;
  /** Start listening, or stop when already listening. */
  toggle: () => Promise<void>;
  cancel: () => void;
}

interface Options {
  /** Receives the final transcript (never empty). */
  onTranscript: (text: string) => void;
  language?: string;
}

/**
 * Tap-to-talk for the composer. Transcription runs on the device through
 * the voice service; the final text is handed to `onTranscript` so the
 * user can review it before sending.
 */
export function useVoiceInput({ onTranscript, language }: Options): VoiceInput {
  const voice = getVoiceService();
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef(onTranscript);
  latest.current = onTranscript;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      voice.cancelListening();
    };
  }, [voice]);

  const toggle = useCallback(async () => {
    if (status === 'listening') {
      setStatus('processing');
      voice.stopListening();
      return;
    }
    if (status === 'processing') {
      return;
    }
    setError(null);
    setPartial('');
    if (!(await ensureMicrophonePermission())) {
      setError('Microphone access is turned off. Enable it in Settings.');
      return;
    }
    setStatus('listening');
    try {
      const result = await voice.listen(
        { language },
        { onPartial: text => mounted.current && setPartial(text) },
      );
      if (result.transcript) {
        latest.current(result.transcript);
      } else {
        setError("Didn't catch that. Try again.");
      }
    } catch (err) {
      if (err instanceof SpeechError && err.code === 'cancelled') {
        return;
      }
      logger.warn('[voice] recognition failed', err);
      setError(err instanceof SpeechError ? err.message : 'Voice input failed.');
    } finally {
      if (mounted.current) {
        setStatus('idle');
        setPartial('');
      }
    }
  }, [language, status, voice]);

  const cancel = useCallback(() => {
    voice.cancelListening();
    setStatus('idle');
    setPartial('');
  }, [voice]);

  return {
    isAvailable: voice.canListen(),
    status,
    partial,
    error,
    toggle,
    cancel,
  };
}
