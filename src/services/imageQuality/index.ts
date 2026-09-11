/**
 * Image quality service entry point.
 *
 *   ImageQualityService (interface)  <-  NativeImageQualityService (default)
 *
 * Screens call `getImageQualityService()`; engines are swapped with
 * `setImageQualityService()` (tests, future TFLite/cloud implementations).
 */

import { NativeImageQualityService } from './NativeImageQualityService';
import type { ImageQualityService } from './types';

let current: ImageQualityService | null = null;

export function getImageQualityService(): ImageQualityService {
  if (!current) {
    current = new NativeImageQualityService();
  }
  return current;
}

export function setImageQualityService(service: ImageQualityService | null): void {
  current = service;
}

export { NativeImageQualityService, toMetrics } from './NativeImageQualityService';
export * from './scoring';
export * from './types';
