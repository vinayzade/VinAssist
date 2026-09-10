import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components';
import { createStyles, useTheme } from '@/theme';
import type { FlashMode } from '../types';

export interface CameraControlsProps {
  onCapture: () => void;
  onFlip: () => void;
  onOpenGallery: () => void;
  onCycleFlash: () => void;
  flash: FlashMode;
  canFlip: boolean;
  canUseFlash: boolean;
  isCapturing: boolean;
  isBusy: boolean;
}

const FLASH_LABEL: Record<FlashMode, string> = {
  off: 'Off',
  on: 'On',
  auto: 'Auto',
};

const SHUTTER = 76;

const useStyles = createStyles(t => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.xl,
    paddingTop: t.spacing.lg,
    backgroundColor: t.colors.overlayStrong,
  },
  side: {
    width: t.layout.touchTarget + t.spacing.md,
    alignItems: 'center',
    gap: t.spacing.xxs,
  },
  roundButton: {
    width: t.layout.touchTarget + t.spacing.sm,
    height: t.layout.touchTarget + t.spacing.sm,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.overlayControl,
  },
  shutterOuter: {
    width: SHUTTER,
    height: SHUTTER,
    borderRadius: t.radius.full,
    borderWidth: 4,
    borderColor: t.colors.onOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: SHUTTER - 16,
    height: SHUTTER - 16,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.onOverlay,
  },
  disabled: { opacity: 0.4 },
}));

/**
 * Bottom bar: gallery | shutter | flip, with flash on the left label row.
 * Rendered over the preview, so colours are fixed camera-UI white on black
 * rather than theme surfaces.
 */
export function CameraControls({
  onCapture,
  onFlip,
  onOpenGallery,
  onCycleFlash,
  flash,
  canFlip,
  canUseFlash,
  isCapturing,
  isBusy,
}: CameraControlsProps) {
  const styles = useStyles();
  const { spacing, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const disabled = isBusy || isCapturing;

  return (
    <View
      style={[styles.root, { paddingBottom: insets.bottom + spacing.lg }]}
      testID="camera-controls"
    >
      <View style={styles.side}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open photo library"
          disabled={disabled}
          onPress={onOpenGallery}
          style={[styles.roundButton, disabled && styles.disabled]}
          testID="camera-gallery"
        >
          <AppText variant="h3" color="onOverlay">
            ▤
          </AppText>
        </Pressable>
        <AppText variant="caption" color="onOverlay">
          Gallery
        </AppText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Take photo"
        accessibilityState={{ disabled, busy: isCapturing }}
        disabled={disabled}
        onPress={onCapture}
        style={({ pressed }) => [
          styles.shutterOuter,
          pressed && { transform: [{ scale: 0.94 }] },
          disabled && styles.disabled,
        ]}
        testID="camera-shutter"
      >
        {isCapturing ? (
          <ActivityIndicator color={colors.onOverlay} />
        ) : (
          <View style={styles.shutterInner} />
        )}
      </Pressable>

      <View style={styles.side}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            canFlip ? 'Switch camera' : 'Only one camera available'
          }
          disabled={disabled || !canFlip}
          onPress={onFlip}
          style={[
            styles.roundButton,
            (disabled || !canFlip) && styles.disabled,
          ]}
          testID="camera-flip"
        >
          <AppText variant="h3" color="onOverlay">
            ⟳
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Flash ${FLASH_LABEL[flash]}`}
          disabled={disabled || !canUseFlash}
          onPress={onCycleFlash}
          hitSlop={spacing.sm}
          testID="camera-flash"
        >
          <AppText
            variant="caption"
            color="onOverlay"
            style={!canUseFlash && styles.disabled}
          >
            Flash {canUseFlash ? FLASH_LABEL[flash] : 'N/A'}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
