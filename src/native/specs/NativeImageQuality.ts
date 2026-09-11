/**
 * TurboModule spec for on-device image quality measurement.
 *
 * The native side only *measures* (sharpness, luminance, resolution, faces).
 * Turning measurements into scores, warnings and a recommendation happens in
 * JS (`services/imageQuality/scoring.ts`) so the thresholds are testable and
 * tunable without a native rebuild. Nothing here touches the network.
 *
 * Keep the types codegen-compatible: type aliases, no string-literal unions,
 * `Array<T>` for lists, `?` for optional fields.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type NativeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NativeFace = {
  /** Bounding box in upright image pixels (may extend outside the image). */
  frame: NativeRect;
  /** Head rotation around the vertical axis, degrees; 0 = facing camera. */
  yaw: number;
  /** Head tilt (roll), degrees. */
  roll: number;
  /** 0-1 probabilities when the detector reports them. */
  leftEyeOpen?: number;
  rightEyeOpen?: number;
  smiling?: number;
};

export type NativeImageMetrics = {
  /** Upright pixel size of the original image (after EXIF rotation). */
  width: number;
  height: number;
  /** Size of the downsampled copy the pixel statistics were computed on. */
  analyzedWidth: number;
  analyzedHeight: number;
  /** Variance of the Laplacian of the luma channel; higher = sharper. */
  laplacianVariance: number;
  /** Mean luma, 0-255. */
  meanLuma: number;
  /** Standard deviation of luma, 0-255 (a contrast proxy). */
  lumaStdDev: number;
  /** Fraction of pixels with luma < 40 (crushed shadows). */
  darkPixelRatio: number;
  /** Fraction of pixels with luma > 240 (clipped highlights). */
  brightPixelRatio: number;
  /** Detected faces; empty when detection was disabled or found none. */
  faces: Array<NativeFace>;
  /** Whether face detection actually ran. */
  faceDetectionRan: boolean;
  durationMs: number;
};

export type NativeAnalyzeOptions = {
  /** Run ML Kit face detection (default true). */
  detectFaces?: boolean;
  /** Long-edge size for pixel statistics (default 1024). */
  maxDimension?: number;
};

export interface Spec extends TurboModule {
  /**
   * Measures the image at `uri` (file://, content:// or a plain path).
   * Rejects with `E_UNREADABLE` when the image cannot be decoded or
   * `E_ANALYSIS` for engine failures.
   */
  analyze(uri: string, options: NativeAnalyzeOptions): Promise<NativeImageMetrics>;
}

export default TurboModuleRegistry.get<Spec>('ImageQuality');
