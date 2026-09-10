import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton, AppCard, AppText } from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import { createStyles, useTheme } from '@/theme';
import {
  SCAN_TARGETS,
  SCAN_TARGET_LABELS,
  type ScanTargetOption,
} from '../constants';
import type { CapturedImage, ScanTarget } from '../types';

function Separator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

const useStyles = createStyles(t => ({
  root: { flex: 1, backgroundColor: t.colors.surfaceSunken },
  image: { flex: 1 },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: t.spacing.md,
    paddingBottom: t.spacing.md,
    backgroundColor: t.colors.overlayStrong,
    gap: t.spacing.xxs,
  },
  sheet: {
    backgroundColor: t.colors.background,
    borderTopLeftRadius: t.radius.xxl,
    borderTopRightRadius: t.radius.xxl,
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing.lg,
    gap: t.spacing.md,
    ...t.shadows.lg,
  },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  flex: { flex: 1 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  targetBadge: {
    width: 40,
    height: 40,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primarySoft,
  },
  targetText: { flex: 1, gap: t.spacing.xxs },
  separator: { height: t.layout.itemGap },
}));

/**
 * Review step between capture and a tool. With a `target` the user just
 * confirms; without one they pick which tool should receive the image.
 */
export function ImagePreviewScreen({
  navigation,
  route,
}: MainStackScreenProps<'ImagePreview'>) {
  const styles = useStyles();
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { image: initial, target } = route.params;
  const [image, setImage] = useState<CapturedImage>(initial);

  // The camera writes straight to a file and does not report dimensions;
  // fill them in so downstream tools can size and orient the image.
  useEffect(() => {
    if (initial.width > 0 && initial.height > 0) {
      return;
    }
    Image.getSize(
      initial.uri,
      (width, height) => setImage(img => ({ ...img, width, height })),
      () => undefined,
    );
  }, [initial]);

  const retake = useCallback(() => navigation.goBack(), [navigation]);

  const confirm = useCallback(
    (destination: ScanTarget) => {
      // Replace so "back" from the tool returns to the camera, not the preview.
      navigation.replace(destination, { imageUri: image.uri });
    },
    [image.uri, navigation],
  );

  const renderTarget = useCallback(
    ({ item }: { item: ScanTargetOption }) => (
      <AppCard
        variant="outlined"
        padding="sm"
        onPress={() => confirm(item.route)}
        accessibilityLabel={`Use for ${item.label}`}
        testID={`preview-target-${item.route}`}
      >
        <View style={styles.targetRow}>
          <View style={styles.targetBadge}>
            <AppText variant="title" color="onPrimarySoft">
              {item.glyph}
            </AppText>
          </View>
          <View style={styles.targetText}>
            <AppText variant="label">{item.label}</AppText>
            <AppText variant="caption" color="textMuted">
              {item.description}
            </AppText>
          </View>
          <AppText variant="h3" color="iconMuted">
            ›
          </AppText>
        </View>
      </AppCard>
    ),
    [confirm, styles],
  );

  return (
    <View style={styles.root} testID="image-preview-screen">
      <Image
        source={{ uri: image.uri }}
        style={styles.image}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessibilityLabel="Captured photo preview"
        testID="preview-image"
      />

      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <AppText variant="title" color="onOverlay">
          {target ? SCAN_TARGET_LABELS[target] : 'Review photo'}
        </AppText>
        <AppText variant="caption" color="onOverlayMuted">
          {image.source === 'gallery' ? 'From your gallery' : 'Just captured'}
          {image.width > 0 ? ` · ${image.width}×${image.height}` : ''}
        </AppText>
      </View>

      <View
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}
      >
        {target ? (
          <View style={styles.actions}>
            <AppButton
              title="Retake"
              variant="secondary"
              style={styles.flex}
              onPress={retake}
              testID="preview-retake"
            />
            <AppButton
              title="Use photo"
              style={styles.flex}
              onPress={() => confirm(target)}
              testID="preview-confirm"
            />
          </View>
        ) : (
          <>
            <AppText variant="h3">Use this photo for…</AppText>
            <FlatList
              data={SCAN_TARGETS}
              keyExtractor={item => item.route}
              renderItem={renderTarget}
              ItemSeparatorComponent={Separator}
              scrollEnabled={false}
              testID="preview-targets"
            />
            <AppButton
              title="Retake"
              variant="ghost"
              onPress={retake}
              testID="preview-retake"
            />
          </>
        )}
      </View>
    </View>
  );
}
