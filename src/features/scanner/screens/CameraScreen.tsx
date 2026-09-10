import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Camera } from 'react-native-vision-camera';
import { LoadingIndicator } from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import { createStyles } from '@/theme';
import { CameraControls } from '../components/CameraControls';
import { CameraOverlay } from '../components/CameraOverlay';
import { CameraPermissionView } from '../components/CameraPermissionView';
import { useCameraCapture } from '../hooks/useCameraCapture';
import { useCameraPermission } from '../hooks/useCameraPermission';
import { useGalleryPicker } from '../hooks/useGalleryPicker';
import { SCAN_TARGET_LABELS } from '../constants';
import type { CapturedImage } from '../types';

const useStyles = createStyles(t => ({
  root: { flex: 1, backgroundColor: t.colors.surfaceSunken },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
}));

/**
 * Live camera. Owns nothing about AI: it produces a `CapturedImage` and
 * hands it to `ImagePreview`, which decides what to do with it.
 */
export function CameraScreen({
  navigation,
  route,
}: MainStackScreenProps<'Scanner'>) {
  const styles = useStyles();
  const target = route.params?.target;
  const isFocused = useIsFocused();
  const permission = useCameraPermission();
  const camera = useCameraCapture('back');
  const gallery = useGalleryPicker();
  const [previewReady, setPreviewReady] = useState(false);

  // Pause the session while another screen (e.g. the preview) is on top.
  const isActive = isFocused && permission.hasPermission;

  const goToPreview = useCallback(
    (image: CapturedImage) =>
      navigation.navigate('ImagePreview', { image, target }),
    [navigation, target],
  );

  const handleCapture = useCallback(async () => {
    const image = await camera.capture();
    if (image) {
      goToPreview(image);
    }
  }, [camera, goToPreview]);

  const handleGallery = useCallback(async () => {
    const image = await gallery.pick();
    if (image) {
      goToPreview(image);
    }
  }, [gallery, goToPreview]);

  const message = camera.error ?? gallery.error;
  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const timer = setTimeout(() => {
      camera.clearError();
      gallery.clearError();
    }, 4000);
    return () => clearTimeout(timer);
  }, [camera, gallery, message]);

  if (!permission.hasPermission) {
    return (
      <CameraPermissionView
        permission={permission}
        onOpenGallery={handleGallery}
        onClose={navigation.goBack}
      />
    );
  }

  const title = target ? SCAN_TARGET_LABELS[target] : 'Scan';
  const hint = camera.device
    ? 'Align the document within the frame'
    : 'Starting camera…';

  return (
    <View style={styles.root} testID="camera-screen">
      {camera.device ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={camera.device}
          isActive={isActive}
          outputs={[camera.photoOutput]}
          resizeMode="cover"
          enableNativeTapToFocusGesture
          onPreviewStarted={() => setPreviewReady(true)}
          onPreviewStopped={() => setPreviewReady(false)}
          onError={camera.onError}
        />
      ) : (
        <LoadingIndicator fullscreen overlay message="Looking for a camera…" />
      )}

      <CameraOverlay
        title={title}
        hint={hint}
        onClose={navigation.goBack}
        showGuide={previewReady}
        message={message}
      />

      <View style={styles.bottom}>
        <CameraControls
          onCapture={handleCapture}
          onFlip={camera.flip}
          onOpenGallery={handleGallery}
          onCycleFlash={camera.cycleFlash}
          flash={camera.flash}
          canFlip={camera.canFlip}
          canUseFlash={camera.canUseFlash}
          isCapturing={camera.isCapturing}
          isBusy={gallery.isPicking || !camera.device}
        />
      </View>
    </View>
  );
}
