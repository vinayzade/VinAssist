import { useCallback, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useCameraPermission as useVisionCameraPermission } from 'react-native-vision-camera';
import type { CameraPermissionStatus } from '../types';

export interface CameraPermission {
  status: CameraPermissionStatus;
  hasPermission: boolean;
  /** True while the OS prompt could still be shown. */
  canRequest: boolean;
  /** Shows the OS prompt. Resolves with whether it was granted. */
  request: () => Promise<boolean>;
  /** Deep-links to the app's settings page for a permanently denied state. */
  openSettings: () => Promise<void>;
}

/**
 * Camera permission with the app's own vocabulary and an automatic first
 * request. Re-checks when the app returns from the background (handled by
 * the underlying hook), so returning from Settings updates the UI.
 */
export function useCameraPermission(autoRequest = true): CameraPermission {
  const { status, hasPermission, canRequestPermission, requestPermission } =
    useVisionCameraPermission();
  const requested = useRef(false);

  const request = useCallback(async () => {
    requested.current = true;
    try {
      return await requestPermission();
    } catch {
      return false;
    }
  }, [requestPermission]);

  useEffect(() => {
    if (autoRequest && canRequestPermission && !requested.current) {
      request().catch(() => undefined);
    }
  }, [autoRequest, canRequestPermission, request]);

  return {
    status: toStatus(status),
    hasPermission,
    canRequest: canRequestPermission,
    request,
    openSettings: () => Linking.openSettings(),
  };
}

function toStatus(
  status: ReturnType<typeof useVisionCameraPermission>['status'],
): CameraPermissionStatus {
  switch (status) {
    case 'authorized':
      return 'granted';
    case 'not-determined':
      return 'not-determined';
    case 'restricted':
      return 'restricted';
    default:
      return 'denied';
  }
}
