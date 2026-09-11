/**
 * OCR service entry point.
 *
 *   OCRService (interface)  <-  MLKitOCRService (default)
 *
 * Screens and hooks call `getOCRService()` and never name an engine, so a
 * different implementation (another vendor, a cloud fallback, a test fake)
 * can be swapped in with `setOCRService()` without touching feature code.
 */

import { MLKitOCRService } from './MLKitOCRService';
import type { OCRService } from './types';

let current: OCRService | null = null;

export function getOCRService(): OCRService {
  if (!current) {
    current = new MLKitOCRService();
  }
  return current;
}

/** Replaces the engine app-wide. Pass `null` to restore the default. */
export function setOCRService(service: OCRService | null): void {
  current = service;
}

export { MLKitOCRService } from './MLKitOCRService';
export { computeStats, countWords } from './ocrStats';
export * from './types';
