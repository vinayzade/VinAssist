import { useCallback, useEffect, useRef, useState } from 'react';
import { useAssistant, type PendingAttachment } from '@/features/aiAssistant';
import { useSettings } from '@/features/settings/hooks/useSettings';
import { SpeechError } from '@/services/speech';
import { ensureMicrophonePermission, getVoiceService } from '@/services/voice';
import { logger } from '@/utils/logger';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceAssistant {
  phase: VoicePhase;
  /** Live transcript while listening. */
  partial: string;
  /** The last thing the user said, once recognised. */
  transcript: string;
  error: string | null;
  canListen: boolean;
  canSpeak: boolean;
  /** Read answers aloud automatically (persisted setting). */
  autoSpeak: boolean;
  setAutoSpeak: (enabled: boolean) => void;
  /** Tap the mic: start listening, or finish when already listening. */
  toggleListening: (attachments?: PendingAttachment[]) => Promise<void>;
  /** Read any text aloud (an earlier answer, for example). */
  speak: (text: string) => Promise<void>;
  /** Stop listening or speaking, whichever is in progress. */
  stop: () => void;
  assistant: ReturnType<typeof useAssistant>;
}

interface Options {
  language?: string;
}

/**
 * The voice pipeline:
 *
 *   microphone -> VoiceService.listen()  (speech-to-text, on device)
 *              -> text
 *              -> assistant.send()       (LLM, backend; scoped to the user's material)
 *              -> answer
 *              -> VoiceService.speak()   (text-to-speech, on device; optional)
 *
 * Recognition and synthesis never touch the LLM; the assistant never
 * touches audio. This hook is the only place the two are joined.
 */
export function useVoiceAssistant({ language }: Options = {}): VoiceAssistant {
  const voice = getVoiceService();
  const assistant = useAssistant();
  const { voiceRepliesEnabled, setVoiceRepliesEnabled } = useSettings();
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [partial, setPartial] = useState('');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const phaseRef = useRef<VoicePhase>('idle');

  const setPhaseSafe = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    if (mounted.current) {
      setPhase(next);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      voice.stopAll();
    };
  }, [voice]);

  const speak = useCallback(
    async (text: string) => {
      if (!voice.canSpeak() || !text.trim()) {
        return;
      }
      setPhaseSafe('speaking');
      try {
        await voice.speak(text, { language });
      } catch (err) {
        if (!(err instanceof SpeechError && err.code === 'cancelled')) {
          logger.warn('[voice] speaking failed', err);
          if (mounted.current) {
            setError(err instanceof SpeechError ? err.message : 'Could not read the answer aloud.');
          }
        }
      } finally {
        if (phaseRef.current === 'speaking') {
          setPhaseSafe('idle');
        }
      }
    },
    [language, setPhaseSafe, voice],
  );

  const toggleListening = useCallback(
    async (attachments: PendingAttachment[] = []) => {
      if (phaseRef.current === 'listening') {
        voice.stopListening();
        return;
      }
      if (phaseRef.current === 'thinking') {
        return;
      }
      if (phaseRef.current === 'speaking') {
        voice.stopSpeaking();
      }
      setError(null);
      setPartial('');
      if (!(await ensureMicrophonePermission())) {
        setError('Microphone access is turned off. Enable it in Settings.');
        return;
      }

      // 1. Speech -> text (device).
      setPhaseSafe('listening');
      let heard = '';
      try {
        const result = await voice.listen(
          { language },
          { onPartial: text => mounted.current && setPartial(text) },
        );
        heard = result.transcript;
      } catch (err) {
        setPhaseSafe('idle');
        if (err instanceof SpeechError && err.code === 'cancelled') {
          return;
        }
        logger.warn('[voice] recognition failed', err);
        setError(err instanceof SpeechError ? err.message : 'Voice input failed.');
        return;
      } finally {
        if (mounted.current) {
          setPartial('');
        }
      }
      if (!heard) {
        setPhaseSafe('idle');
        setError("Didn't catch that. Tap the microphone and try again.");
        return;
      }
      if (mounted.current) {
        setTranscript(heard);
      }

      // 2. Text -> assistant (LLM on the backend).
      setPhaseSafe('thinking');
      const answer = await assistant.send({ text: heard, attachments, inputMode: 'voice' });
      if (!mounted.current) {
        return;
      }
      if (!answer) {
        setPhaseSafe('idle');
        return;
      }

      // 3. Answer -> speech (device, optional).
      if (voiceRepliesEnabled && voice.canSpeak()) {
        await speak(answer.answer);
      } else {
        setPhaseSafe('idle');
      }
    },
    [assistant, language, setPhaseSafe, speak, voice, voiceRepliesEnabled],
  );

  const stop = useCallback(() => {
    voice.stopAll();
    setPartial('');
    if (phaseRef.current !== 'thinking') {
      setPhaseSafe('idle');
    }
  }, [setPhaseSafe, voice]);

  return {
    phase,
    partial,
    transcript,
    error,
    canListen: voice.canListen(),
    canSpeak: voice.canSpeak(),
    autoSpeak: voiceRepliesEnabled,
    setAutoSpeak: setVoiceRepliesEnabled,
    toggleListening,
    speak,
    stop,
    assistant,
  };
}
