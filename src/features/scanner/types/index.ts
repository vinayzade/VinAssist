export type ScanTarget =
  | 'OCR'
  | 'DocumentAnalysis'
  | 'ImageAnalysis'
  | 'ImageQuality';

export type CameraPosition = 'back' | 'front';

export type FlashMode = 'off' | 'on' | 'auto';

export type ImageSource = 'camera' | 'gallery';

/** A picture ready to hand to a tool. `uri` is always a `file://` URL. */
export interface CapturedImage {
  uri: string;
  width: number;
  height: number;
  source: ImageSource;
  mimeType?: string;
}

export type CameraPermissionStatus =
  | 'not-determined'
  | 'granted'
  | 'denied'
  | 'restricted';
