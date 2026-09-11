/**
 * Turns raw measurements into scores, checks, warnings and a recommendation.
 *
 * Pure and deterministic, so every threshold below is covered by unit tests
 * and can be tuned without touching native code. Scores are 0-100.
 */

import type {
  DetectedFace,
  ImageMetrics,
  ImageQualityResult,
  QualityChecks,
  QualityStatus,
  QualitySubject,
  QualityWarning,
  ResolutionGrade,
} from './types';

/* ------------------------------ thresholds ------------------------------ */

export const THRESHOLDS = {
  /** Laplacian variance mapped on a log scale between these bounds. */
  blur: { floorVariance: 15, ceilVariance: 1200, blurryBelowScore: 50, softBelowScore: 65 },
  /** Mean luma (0-255) comfort band and hard limits. */
  brightness: {
    idealLow: 95,
    idealHigh: 165,
    lowLightBelow: 70,
    overexposedAbove: 195,
    darkRatioLimit: 0.45,
    brightRatioLimit: 0.12,
    lowContrastStdDev: 32,
  },
  /** Megapixels for each grade; score scales up to `fullScoreMp`. */
  resolution: { okMp: 0.8, goodMp: 2.0, fullScoreMp: 4.0, minShortSide: 480 },
  face: {
    tooSmallAreaRatio: 0.03,
    edgeMarginRatio: 0.02,
    turnedYawDegrees: 30,
    eyesClosedBelow: 0.3,
  },
  status: { goodFrom: 75, fairFrom: 50 },
} as const;

const WEIGHTS = { blur: 0.4, brightness: 0.3, resolution: 0.15, face: 0.15 } as const;

/* ------------------------------- helpers -------------------------------- */

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value);

/* ---------------------------- component scores --------------------------- */

export function scoreBlur(laplacianVariance: number): number {
  const { floorVariance, ceilVariance } = THRESHOLDS.blur;
  const lo = Math.log10(floorVariance);
  const hi = Math.log10(ceilVariance);
  const value = Math.log10(Math.max(laplacianVariance, 0) + 1);
  return clamp(((value - lo) / (hi - lo)) * 100);
}

export function scoreBrightness(metrics: Pick<ImageMetrics, 'meanLuma' | 'darkPixelRatio' | 'brightPixelRatio' | 'lumaStdDev'>): number {
  const t = THRESHOLDS.brightness;
  let score = 100;
  if (metrics.meanLuma < t.idealLow) {
    // Linear fall-off from the comfort band down to pitch black.
    score -= ((t.idealLow - metrics.meanLuma) / t.idealLow) * 100;
  } else if (metrics.meanLuma > t.idealHigh) {
    score -= ((metrics.meanLuma - t.idealHigh) / (255 - t.idealHigh)) * 100;
  }
  // Clipping in either direction is penalised on top of the mean.
  score -= clamp(metrics.darkPixelRatio - 0.2, 0, 1) * 60;
  score -= clamp(metrics.brightPixelRatio - 0.03, 0, 1) * 150;
  if (metrics.lumaStdDev < t.lowContrastStdDev) {
    score -= ((t.lowContrastStdDev - metrics.lumaStdDev) / t.lowContrastStdDev) * 25;
  }
  return clamp(score);
}

export function gradeResolution(width: number, height: number): ResolutionGrade {
  const mp = (width * height) / 1e6;
  const shortSide = Math.min(width, height);
  const t = THRESHOLDS.resolution;
  if (mp >= t.goodMp && shortSide >= t.minShortSide) {
    return 'GOOD';
  }
  if (mp >= t.okMp) {
    return 'OK';
  }
  return 'LOW';
}

export function scoreResolution(width: number, height: number): number {
  const mp = (width * height) / 1e6;
  return clamp((mp / THRESHOLDS.resolution.fullScoreMp) * 100);
}

interface FaceAssessment {
  score: number | null;
  warnings: QualityWarning[];
  multipleFaces: boolean;
  outsideFrame: boolean;
}

export function assessFaces(faces: DetectedFace[], subject: QualitySubject): FaceAssessment {
  const warnings: QualityWarning[] = [];
  const t = THRESHOLDS.face;

  if (faces.length === 0) {
    if (subject === 'portrait') {
      warnings.push({
        code: 'no-face',
        message: 'No face detected. Make sure the face is visible and well lit.',
        severity: 'high',
      });
      return { score: 0, warnings, multipleFaces: false, outsideFrame: false };
    }
    return { score: null, warnings, multipleFaces: false, outsideFrame: false };
  }

  const largest = faces.reduce((a, b) => (b.areaRatio > a.areaRatio ? b : a));
  let score = 100;
  const multipleFaces = faces.length > 1;
  const outsideFrame = faces.some(f => f.outsideFrame);

  if (multipleFaces) {
    score -= 30;
    warnings.push({
      code: 'multiple-faces',
      message: `${faces.length} faces detected. Only one person should be in the frame.`,
      severity: 'medium',
    });
  }
  if (outsideFrame) {
    score -= 40;
    warnings.push({
      code: 'face-outside-frame',
      message: 'The face is cut off by the edge. Centre it in the frame.',
      severity: 'high',
    });
  }
  if (largest.areaRatio < t.tooSmallAreaRatio) {
    score -= 25;
    warnings.push({
      code: 'face-too-small',
      message: 'The face is small in the photo. Move closer.',
      severity: 'medium',
    });
  }
  if (Math.abs(largest.yaw) > t.turnedYawDegrees) {
    score -= 20;
    warnings.push({
      code: 'face-turned',
      message: 'The face is turned away. Look straight at the camera.',
      severity: 'low',
    });
  }
  if (largest.eyesOpen === false) {
    score -= 15;
    warnings.push({
      code: 'eyes-closed',
      message: 'Eyes appear closed. Try again with eyes open.',
      severity: 'low',
    });
  }

  return { score: clamp(score), warnings, multipleFaces, outsideFrame };
}

/* --------------------------------- overall -------------------------------- */

export function statusFor(score: number): QualityStatus {
  if (score >= THRESHOLDS.status.goodFrom) {
    return 'GOOD';
  }
  if (score >= THRESHOLDS.status.fairFrom) {
    return 'FAIR';
  }
  return 'POOR';
}

/** Composes the human recommendation from the worst problems, best first. */
export function recommendationFor(status: QualityStatus, warnings: QualityWarning[]): string {
  if (warnings.length === 0) {
    return 'Looks good. This photo is sharp, well lit and ready to use.';
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...warnings].sort((a, b) => order[a.severity] - order[b.severity]);
  const lead = sorted[0].message;
  if (status === 'GOOD') {
    return `Usable as is. ${lead}`;
  }
  if (status === 'FAIR') {
    return `Consider retaking. ${lead}`;
  }
  return `Retake recommended. ${lead}`;
}

export function scoreImageQuality(
  metrics: ImageMetrics,
  subject: QualitySubject = 'general',
  engine = 'on-device',
): ImageQualityResult {
  const blurScore = scoreBlur(metrics.laplacianVariance);
  const brightnessScore = scoreBrightness(metrics);
  const resolutionScore = scoreResolution(metrics.width, metrics.height);
  const resolution = gradeResolution(metrics.width, metrics.height);
  const face = assessFaces(metrics.faces, subject);

  const warnings: QualityWarning[] = [];
  const t = THRESHOLDS;

  const blur = blurScore < t.blur.blurryBelowScore;
  if (blur) {
    warnings.push({
      code: 'blur',
      message: 'The image is blurry. Hold the camera steady and tap to focus.',
      severity: 'high',
    });
  } else if (blurScore < t.blur.softBelowScore) {
    warnings.push({
      code: 'soft-focus',
      message: 'Focus is slightly soft. Tap the subject to focus before shooting.',
      severity: 'low',
    });
  }

  const lowLight =
    metrics.meanLuma < t.brightness.lowLightBelow ||
    metrics.darkPixelRatio > t.brightness.darkRatioLimit;
  const overexposed =
    metrics.meanLuma > t.brightness.overexposedAbove ||
    metrics.brightPixelRatio > t.brightness.brightRatioLimit;
  if (lowLight) {
    warnings.push({
      code: 'low-light',
      message: 'The photo is too dark. Move to better light or turn on the flash.',
      severity: 'high',
    });
  } else if (overexposed) {
    warnings.push({
      code: 'overexposed',
      message: 'The photo is overexposed. Avoid direct light behind or on the subject.',
      severity: 'high',
    });
  } else if (
    metrics.lumaStdDev < t.brightness.lowContrastStdDev ||
    metrics.meanLuma < t.brightness.idealLow ||
    metrics.meanLuma > t.brightness.idealHigh
  ) {
    warnings.push({
      code: 'low-contrast',
      message: 'Background lighting could be improved.',
      severity: 'low',
    });
  }

  if (resolution === 'LOW') {
    warnings.push({
      code: 'low-resolution',
      message: 'The image resolution is low. Use the camera at full resolution.',
      severity: 'medium',
    });
  }

  warnings.push(...face.warnings);

  // Face score only counts when there is one; otherwise its weight is
  // redistributed so a landscape is not penalised for having no face.
  const faceWeight = face.score === null ? 0 : WEIGHTS.face;
  const totalWeight = WEIGHTS.blur + WEIGHTS.brightness + WEIGHTS.resolution + faceWeight;
  const weighted =
    blurScore * WEIGHTS.blur +
    brightnessScore * WEIGHTS.brightness +
    resolutionScore * WEIGHTS.resolution +
    (face.score ?? 0) * faceWeight;
  let overall = weighted / totalWeight;

  // Hard failures cap the overall score so the headline can't read GOOD.
  if (blur || lowLight || overexposed || face.outsideFrame) {
    overall = Math.min(overall, t.status.goodFrom - 1);
  }
  if (subject === 'portrait' && metrics.faces.length === 0) {
    overall = Math.min(overall, t.status.fairFrom - 1);
  }

  const overallScore = round(clamp(overall));
  const status = statusFor(overallScore);

  const checks: QualityChecks = {
    faceDetected: metrics.faces.length > 0,
    blur,
    lowLight,
    overexposed,
    multipleFaces: face.multipleFaces,
    faceOutsideFrame: face.outsideFrame,
    resolution,
  };

  return {
    overallScore,
    status,
    blurScore: round(blurScore),
    brightnessScore: round(brightnessScore),
    resolutionScore: round(resolutionScore),
    faceScore: face.score === null ? null : round(face.score),
    faceDetected: checks.faceDetected,
    faceCount: metrics.faces.length,
    checks,
    warnings,
    recommendation: recommendationFor(status, warnings),
    metrics,
    subject,
    engine,
  };
}
