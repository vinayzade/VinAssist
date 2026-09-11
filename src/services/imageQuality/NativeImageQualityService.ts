import {
  getImageQualityModule,
  type ImageQualityModule,
  type NativeFace,
  type NativeImageMetrics,
} from '@/native';
import { logger } from '@/utils/logger';
import { THRESHOLDS, scoreImageQuality } from './scoring';
import {
  ImageQualityError,
  type DetectedFace,
  type ImageMetrics,
  type ImageQualityInput,
  type ImageQualityOptions,
  type ImageQualityResult,
  type ImageQualityService,
} from './types';

const NATIVE_CODES: Record<string, ImageQualityError['code']> = {
  E_UNREADABLE: 'unreadable',
  E_ANALYSIS: 'analysis',
};

const MESSAGES: Record<ImageQualityError['code'], string> = {
  unavailable: 'Image analysis is not available on this device.',
  unreadable: 'Could not read that image. Try another photo.',
  analysis: 'Image analysis failed. Try again.',
  unknown: 'Something went wrong while analysing the image.',
};

/**
 * `ImageQualityService` backed by the `ImageQuality` TurboModule: Kotlin
 * pixel statistics plus ML Kit face detection, all on the device. Scoring
 * happens in JS (`scoring.ts`).
 */
export class NativeImageQualityService implements ImageQualityService {
  readonly engine = 'on-device';

  constructor(
    private readonly module: ImageQualityModule | null = getImageQualityModule(),
  ) {}

  isAvailable(): boolean {
    return this.module !== null;
  }

  async analyze(
    input: ImageQualityInput,
    options: ImageQualityOptions = {},
  ): Promise<ImageQualityResult> {
    if (!this.module) {
      throw new ImageQualityError(MESSAGES.unavailable, 'unavailable');
    }
    if (!input.uri) {
      throw new ImageQualityError(MESSAGES.unreadable, 'unreadable');
    }

    let raw: NativeImageMetrics;
    try {
      raw = await this.module.analyze(input.uri, { detectFaces: true });
    } catch (error) {
      const nativeCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code: unknown }).code)
          : '';
      const code = NATIVE_CODES[nativeCode] ?? 'unknown';
      logger.warn('[imageQuality] analysis failed', nativeCode, error);
      throw new ImageQualityError(MESSAGES[code], code);
    }

    return scoreImageQuality(toMetrics(raw), options.subject ?? 'general', this.engine);
  }
}

/** Adapts native output to engine-independent metrics with derived face facts. */
export function toMetrics(raw: NativeImageMetrics): ImageMetrics {
  const area = Math.max(1, raw.width * raw.height);
  const marginX = raw.width * THRESHOLDS.face.edgeMarginRatio;
  const marginY = raw.height * THRESHOLDS.face.edgeMarginRatio;

  const faces: DetectedFace[] = (raw.faces ?? []).map((face: NativeFace) => {
    const { frame } = face;
    const outsideFrame =
      frame.x <= marginX ||
      frame.y <= marginY ||
      frame.x + frame.width >= raw.width - marginX ||
      frame.y + frame.height >= raw.height - marginY;
    const eyes =
      typeof face.leftEyeOpen === 'number' && typeof face.rightEyeOpen === 'number'
        ? Math.max(face.leftEyeOpen, face.rightEyeOpen) >= THRESHOLDS.face.eyesClosedBelow
        : undefined;
    return {
      frame,
      areaRatio: (frame.width * frame.height) / area,
      outsideFrame,
      yaw: face.yaw,
      roll: face.roll,
      eyesOpen: eyes,
    };
  });

  return {
    width: raw.width,
    height: raw.height,
    laplacianVariance: raw.laplacianVariance,
    meanLuma: raw.meanLuma,
    lumaStdDev: raw.lumaStdDev,
    darkPixelRatio: raw.darkPixelRatio,
    brightPixelRatio: raw.brightPixelRatio,
    faces,
    faceDetectionRan: raw.faceDetectionRan,
    durationMs: raw.durationMs,
  };
}
