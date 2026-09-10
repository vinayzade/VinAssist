import React from 'react';
import { EmptyState, LoadingIndicator, ScreenContainer } from '@/components';
import type { CameraPermission } from '../hooks/useCameraPermission';

interface CameraPermissionViewProps {
  permission: CameraPermission;
  onOpenGallery: () => void;
  onClose: () => void;
}

/**
 * What the user sees instead of the preview when the camera cannot start:
 * the OS prompt is pending, permission was denied, or the device blocks it.
 * Always offers the gallery so the flow is never a dead end.
 */
export function CameraPermissionView({
  permission,
  onOpenGallery,
  onClose,
}: CameraPermissionViewProps) {
  const gallery = { title: 'Choose from gallery', onPress: onOpenGallery };

  if (permission.status === 'not-determined') {
    return (
      <ScreenContainer>
        <LoadingIndicator fullscreen message="Requesting camera access…" />
      </ScreenContainer>
    );
  }

  if (permission.status === 'restricted') {
    return (
      <ScreenContainer>
        <EmptyState
          icon="▣"
          title="Camera unavailable"
          description="Camera access is restricted on this device. You can still pick a photo from your gallery."
          action={gallery}
          secondaryAction={{ title: 'Close', onPress: onClose }}
          testID="camera-permission-restricted"
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <EmptyState
        icon="▣"
        title="Allow camera access"
        description="VinAssist needs the camera to scan documents and images. Nothing is uploaded until you confirm a photo."
        action={
          permission.canRequest
            ? {
                title: 'Allow camera',
                onPress: () => {
                  permission.request().catch(() => undefined);
                },
              }
            : {
                title: 'Open Settings',
                onPress: () => {
                  permission.openSettings().catch(() => undefined);
                },
              }
        }
        secondaryAction={{ ...gallery, variant: 'secondary' }}
        testID="camera-permission-denied"
      />
    </ScreenContainer>
  );
}
