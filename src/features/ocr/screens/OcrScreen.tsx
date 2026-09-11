import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  EmptyState,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import { useGalleryPicker } from '@/features/scanner';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import { createStyles } from '@/theme';
import { useOcr } from '../hooks/useOcr';

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  sources: { flexDirection: 'row', gap: t.spacing.sm },
  flex: { flex: 1 },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceSunken,
  },
  previewCard: { gap: t.spacing.md },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  progress: { paddingVertical: t.spacing.lg, gap: t.spacing.sm, alignItems: 'center' },
  hint: { marginTop: t.spacing.xxs },
}));

/**
 * Smart OCR entry point.
 *
 *   Camera / gallery -> image -> native OCR -> OCRResult screen
 *
 * Arriving with `imageUri` (from the scanner flow) starts recognition
 * immediately; otherwise the user takes a photo or picks one.
 */
export function OcrScreen({ navigation, route }: MainStackScreenProps<'OCR'>) {
  const styles = useStyles();
  const paramUri = route.params?.imageUri;
  const [imageUri, setImageUri] = useState<string | null>(paramUri ?? null);
  const gallery = useGalleryPicker();
  const ocr = useOcr();
  const autoRan = useRef<string | null>(null);

  const run = useCallback(
    async (uri: string) => {
      const result = await ocr.recognize(uri);
      if (result) {
        navigation.navigate('OCRResult', { imageUri: uri, result });
      }
    },
    [navigation, ocr],
  );

  // A photo handed over by the scanner is recognised straight away, once.
  useEffect(() => {
    if (paramUri && autoRan.current !== paramUri) {
      autoRan.current = paramUri;
      setImageUri(paramUri);
      run(paramUri);
    }
  }, [paramUri, run]);

  const chooseImage = async () => {
    const picked = await gallery.pick();
    if (picked) {
      ocr.reset();
      setImageUri(picked.uri);
    }
  };

  const changeImage = () => {
    ocr.reset();
    setImageUri(null);
  };

  const busy = ocr.status === 'recognizing';
  const errorMessage = ocr.error ?? gallery.error;

  return (
    <ScreenContainer edges={['bottom']} scroll testID="ocr-screen">
      <AppHeader
        title="Smart OCR"
        subtitle="Extract editable text from a photo. Runs on this device."
      />

      <View style={styles.content}>
        {!ocr.isAvailable ? (
          <EmptyState
            fullscreen={false}
            icon="!"
            title="Text recognition unavailable"
            description="This build has no on-device OCR engine. Rebuild the app to include it."
            testID="ocr-unavailable"
          />
        ) : imageUri ? (
          <AppCard variant="filled" testID="ocr-preview">
            <View style={styles.previewCard}>
              <Image
                source={{ uri: imageUri }}
                style={styles.preview}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
                accessibilityLabel="Selected image"
                testID="ocr-preview-image"
              />
              {busy ? (
                <View style={styles.progress} testID="ocr-progress">
                  <LoadingIndicator message="Reading text…" />
                </View>
              ) : (
                <View style={styles.actions}>
                  <AppButton
                    title="Change image"
                    variant="secondary"
                    style={styles.flex}
                    onPress={changeImage}
                    testID="ocr-change"
                  />
                  <AppButton
                    title={ocr.status === 'error' ? 'Try again' : 'Extract text'}
                    style={styles.flex}
                    onPress={() => run(imageUri)}
                    testID="ocr-extract"
                  />
                </View>
              )}
            </View>
          </AppCard>
        ) : (
          <>
            <View style={styles.sources}>
              <AppButton
                title="Take photo"
                style={styles.flex}
                disabled={gallery.isPicking}
                onPress={() => navigation.navigate('Scanner', { target: 'OCR' })}
                testID="ocr-capture"
              />
              <AppButton
                title="Choose image"
                variant="secondary"
                style={styles.flex}
                loading={gallery.isPicking}
                onPress={chooseImage}
                testID="ocr-choose"
              />
            </View>
            <EmptyState
              fullscreen={false}
              icon="T"
              title="No image selected"
              description="Photograph a page or pick an image. Text is recognised on your device and never uploaded."
            />
          </>
        )}

        {errorMessage ? (
          <AppText
            variant="caption"
            color="error"
            accessibilityLiveRegion="polite"
            style={styles.hint}
            testID="ocr-error"
          >
            {errorMessage}
          </AppText>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
