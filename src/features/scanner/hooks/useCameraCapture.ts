import { useCallback, useMemo, useRef, useState } from 'react';
import { useCameraDevice, usePhotoOutput } from 'react-native-vision-camera';
import { logger } from '@/utils/logger';
import type { CameraPosition, CapturedImage, FlashMode } from '../types';

const FLASH_CYCLE: FlashMode[] = ['off', 'on', 'auto'];

export interface CameraCapture {
  position: CameraPosition;
  /** The resolved device for `position`, or undefined while devices load. */
  device: ReturnType<typeof useCameraDevice>;
  /** Whether a device exists at the opposite position. */
  canFlip: boolean;
  flip: () => void;
  flash: FlashMode;
  /** False when the active device has no flash (typical for front cameras). */
  canUseFlash: boolean;
  cycleFlash: () => void;
  /** Output to pass into `<Camera outputs>`. */
  photoOutput: ReturnType<typeof usePhotoOutput>;
  isCapturing: boolean;
  /** Takes a photo to a temporary file and resolves with its `file://` URI. */
  capture: () => Promise<CapturedImage | null>;
  error: string | null;
  clearError: () => void;
  /** Handler for the Camera view's `onError`; surfaces a user-facing message. */
  onError: (error: Error) => void;
}

/**
 * Everything the camera screen needs to take a picture, independent of
 * how it is rendered. Keeps the Vision Camera specifics out of the UI.
 */
export function useCameraCapture(
  initialPosition: CameraPosition = 'back',
): CameraCapture {
  const [position, setPosition] = useState<CameraPosition>(initialPosition);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCapturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const device = useCameraDevice(position);
  const opposite = useCameraDevice(position === 'back' ? 'front' : 'back');
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    quality: 0.9,
    qualityPrioritization: 'balanced',
  });

  const canUseFlash = Boolean(device?.hasFlash);
  const effectiveFlash: FlashMode = canUseFlash ? flash : 'off';

  const flip = useCallback(() => {
    if (opposite) {
      setPosition(p => (p === 'back' ? 'front' : 'back'));
    }
  }, [opposite]);

  const cycleFlash = useCallback(() => {
    setFlash(
      f => FLASH_CYCLE[(FLASH_CYCLE.indexOf(f) + 1) % FLASH_CYCLE.length],
    );
  }, []);

  const onError = useCallback((err: Error) => {
    logger.error('[camera] session error', err);
    setError('The camera stopped unexpectedly. Please try again.');
  }, []);

  const capture = useCallback(async (): Promise<CapturedImage | null> => {
    if (inFlight.current || !device) {
      return null;
    }
    inFlight.current = true;
    setCapturing(true);
    setError(null);
    try {
      const file = await photoOutput.capturePhotoToFile(
        { flashMode: effectiveFlash, enableShutterSound: true },
        {},
      );
      return {
        uri: toFileUri(file.filePath),
        // Dimensions are read lazily by the preview screen via Image.getSize;
        // capturePhotoToFile does not report them.
        width: 0,
        height: 0,
        source: 'camera',
        mimeType: 'image/jpeg',
      };
    } catch (err) {
      logger.error('[camera] capture failed', err);
      setError('Could not take the photo. Please try again.');
      return null;
    } finally {
      inFlight.current = false;
      setCapturing(false);
    }
  }, [device, effectiveFlash, photoOutput]);

  return useMemo(
    () => ({
      position,
      device,
      canFlip: Boolean(opposite),
      flip,
      flash: effectiveFlash,
      canUseFlash,
      cycleFlash,
      photoOutput,
      isCapturing,
      capture,
      error,
      clearError: () => setError(null),
      onError,
    }),
    [
      canUseFlash,
      capture,
      cycleFlash,
      device,
      effectiveFlash,
      error,
      flip,
      isCapturing,
      onError,
      opposite,
      photoOutput,
      position,
    ],
  );
}

/** Vision Camera returns a filesystem path; Image components want a URL. */
export function toFileUri(path: string): string {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
}
