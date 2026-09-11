export type QualityStatus = 'GOOD' | 'FAIR' | 'POOR';
export type ResolutionGrade = 'LOW' | 'OK' | 'GOOD';

/**
 * What the photo is meant to be of. Face checks are always run and
 * reported; in `portrait` mode a missing face also costs points and a
 * warning, in `general` mode it does not.
 */
export type QualitySubject = 'general' | 'portrait';

export interface QualityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  frame: QualityRect;
  /** Fraction of the image area the face covers, 0-1. */
  areaRatio: number;
  /** True when the box touches or crosses the image edge. */
  outsideFrame: boolean;
  yaw: number;
  roll: number;
  eyesOpen?: boolean;
}

/** Raw, engine-independent measurements the scorer works from. */
export interface ImageMetrics {
  width: number;
  height: number;
  laplacianVariance: number;
  meanLuma: number;
  lumaStdDev: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  faces: DetectedFace[];
  faceDetectionRan: boolean;
  durationMs: number;
}

export type QualityWarningCode =
  | 'blur'
  | 'soft-focus'
  | 'low-light'
  | 'overexposed'
  | 'low-contrast'
  | 'low-resolution'
  | 'no-face'
  | 'multiple-faces'
  | 'face-outside-frame'
  | 'face-too-small'
  | 'face-turned'
  | 'eyes-closed';

export interface QualityWarning {
  code: QualityWarningCode;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export interface QualityChecks {
  faceDetected: boolean;
  blur: boolean;
  lowLight: boolean;
  overexposed: boolean;
  multipleFaces: boolean;
  faceOutsideFrame: boolean;
  resolution: ResolutionGrade;
}

export interface ImageQualityResult {
  overallScore: number;
  status: QualityStatus;
  blurScore: number;
  brightnessScore: number;
  resolutionScore: number;
  faceScore: number | null;
  faceDetected: boolean;
  faceCount: number;
  checks: QualityChecks;
  warnings: QualityWarning[];
  recommendation: string;
  metrics: ImageMetrics;
  subject: QualitySubject;
  engine: string;
}

export interface ImageQualityInput {
  uri: string;
}

export interface ImageQualityOptions {
  subject?: QualitySubject;
}

export type ImageQualityErrorCode = 'unavailable' | 'unreadable' | 'analysis' | 'unknown';

export class ImageQualityError extends Error {
  constructor(message: string, readonly code: ImageQualityErrorCode) {
    super(message);
    this.name = 'ImageQualityError';
  }
}

/** What every image quality engine must provide. Screens depend only on this. */
export interface ImageQualityService {
  readonly engine: string;
  isAvailable(): boolean;
  analyze(input: ImageQualityInput, options?: ImageQualityOptions): Promise<ImageQualityResult>;
}
