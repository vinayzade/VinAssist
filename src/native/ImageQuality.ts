/**
 * Typed access to the `ImageQuality` TurboModule. Optional at runtime (null
 * under Jest, on platforms without an implementation, or in a stale build).
 */

import NativeImageQuality, {
  type NativeAnalyzeOptions,
  type NativeFace,
  type NativeImageMetrics,
  type Spec as ImageQualityModule,
} from './specs/NativeImageQuality';

export type { NativeAnalyzeOptions, NativeFace, NativeImageMetrics, ImageQualityModule };

export function getImageQualityModule(): ImageQualityModule | null {
  return NativeImageQuality ?? null;
}
