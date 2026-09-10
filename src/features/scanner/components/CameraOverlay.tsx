import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components';
import { createStyles, useTheme } from '@/theme';

export interface CameraOverlayProps {
  title: string;
  hint?: string;
  onClose: () => void;
  /** Draws the document framing guide in the centre of the preview. */
  showGuide?: boolean;
  /** Transient message (e.g. capture error) shown above the controls. */
  message?: string | null;
}

const CORNER = 28;
const CORNER_WIDTH = 3;

const useStyles = createStyles(t => ({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.spacing.md,
    paddingBottom: t.spacing.md,
    backgroundColor: t.colors.overlayStrong,
  },
  closeButton: {
    width: t.layout.touchTarget,
    height: t.layout.touchTarget,
    borderRadius: t.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.overlayControl,
  },
  titleBlock: { flex: 1, alignItems: 'center', gap: t.spacing.xxs },
  spacer: { width: t.layout.touchTarget },
  guideArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guide: { width: '82%', aspectRatio: 3 / 4 },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: t.colors.onOverlay,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderTopLeftRadius: t.radius.sm,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderTopRightRadius: t.radius.sm,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderBottomLeftRadius: t.radius.sm,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderBottomRightRadius: t.radius.sm,
  },
  message: {
    alignSelf: 'center',
    marginBottom: t.spacing.md,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.overlayStrong,
  },
}));

/**
 * Chrome drawn over the live preview: a top bar with close + title, an
 * optional framing guide, and a message pill. Everything is
 * `pointerEvents="box-none"` so touches reach the preview beneath.
 */
export function CameraOverlay({
  title,
  hint,
  onClose,
  showGuide = true,
  message,
}: CameraOverlayProps) {
  const styles = useStyles();
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close camera"
          onPress={onClose}
          style={styles.closeButton}
          testID="camera-close"
        >
          <AppText variant="h3" color="onOverlay">
            ✕
          </AppText>
        </Pressable>
        <View style={styles.titleBlock}>
          <AppText variant="title" color="onOverlay">
            {title}
          </AppText>
          {hint ? (
            <AppText variant="caption" color="onOverlayMuted">
              {hint}
            </AppText>
          ) : null}
        </View>
        <View style={styles.spacer} />
      </View>

      <View style={styles.guideArea} pointerEvents="none">
        {showGuide ? (
          <View style={styles.guide} testID="camera-guide">
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        ) : null}
      </View>

      {message ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <AppText variant="bodySmall" color="onOverlay">
            {message}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
