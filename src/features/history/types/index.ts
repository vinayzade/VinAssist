export type HistoryKind =
  | 'chat'
  | 'scan'
  | 'ocr'
  | 'documentAnalysis'
  | 'imageAnalysis'
  | 'imageQuality'
  | 'sentiment'
  | 'voice';

export interface HistoryItem {
  id: string;
  kind: HistoryKind;
  title: string;
  summary: string;
  createdAt: string;
}

export interface HistoryState {
  items: HistoryItem[];
}
