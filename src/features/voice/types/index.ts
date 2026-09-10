export type RecordingStatus = 'idle' | 'recording' | 'processing';

export interface Transcript {
  text: string;
  durationMs: number;
}
