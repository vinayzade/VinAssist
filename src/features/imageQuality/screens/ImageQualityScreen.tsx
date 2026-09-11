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
import type { QualitySubject } from '@/services/imageQuality';
import { createStyles } from '@/theme';
import { useImageQuality } from '../hooks/useImageQuality';

const SUBJECTS: { value: QualitySubject; label: string; hint: string }[] = [
  { value: 'general', label: 'Any photo', hint: 'Sharpness, lighting and resolution.' },
  { value: 'portrait', label: 'Portrait / ID', hint: 'Also requires one clear, centred face.' },
];

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  sources: { flexDirection: 'row', gap: t.spacing.sm },
  flex: { flex: 1 },
  section: { gap: t.spacing.sm },
  segment: { flexDirection: 'row', gap: t.spacing.sm },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceSunken,
  },
  previewCard: { gap: t.spacing.md },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  progress: { paddingVertical: t.spacing.lg, alignItems: 'center' },
  hint: { marginTop: t.spacing.xxs },
}));

/**
 * Image Quality entry point.
 *
 *   Camera / gallery -> image -> native measurement -> JS scoring -> result
 *
 * Everything runs on the device. A photo arriving from the scanner is
 * analysed immediately.
 */
export function ImageQualityScreen({
  navigation,
  route,
}: MainStackScreenProps<'ImageQuality'>) {
  const styles = useStyles();
  const paramUri = route.params?.imageUri;
  const [imageUri, setImageUri] = useState<string | null>(paramUri ?? null);
  const [subject, setSubject] = useState<QualitySubject>('general');
  const gallery = useGalleryPicker();
  const quality = useImageQuality();
  const autoRan = useRef<string | null>(null);

  const run = useCallback(
    async (uri: string, mode: QualitySubject) => {
      const result = await quality.analyze(uri, { subject: mode });
      if (result) {
        navigation.navigate('ImageQualityResult', { imageUri: uri, result });
      }
    },
    [navigation, quality],
  );

  useEffect(() => {
    if (paramUri && autoRan.current !== paramUri) {
      autoRan.current = paramUri;
      setImageUri(paramUri);
      run(paramUri, subject);
    }
  }, [paramUri, run, subject]);

  const chooseImage = async () => {
    const picked = await gallery.pick();
    if (picked) {
      quality.reset();
      setImageUri(picked.uri);
    }
  };

  const busy = quality.status === 'analyzing';
  const errorMessage = quality.error ?? gallery.error;

  return (
    <ScreenContainer edges={['bottom']} scroll testID="image-quality-screen">
      <AppHeader
        title="Image Quality"
        subtitle="Check blur, lighting, resolution and faces. Runs on this device."
      />

      <View style={styles.content}>
        {!quality.isAvailable ? (
          <EmptyState
            fullscreen={false}
            icon="!"
            title="Image analysis unavailable"
            description="This build has no on-device analysis engine. Rebuild the app to include it."
            testID="image-quality-unavailable"
          />
        ) : (
          <>
            <View style={styles.section}>
              <AppText variant="overline" color="textMuted">
                Photo of
              </AppText>
              <View style={styles.segment}>
                {SUBJECTS.map(option => (
                  <AppButton
                    key={option.value}
                    title={option.label}
                    size="sm"
                    variant={subject === option.value ? 'primary' : 'secondary'}
                    style={styles.flex}
                    disabled={busy}
                    accessibilityState={{ selected: subject === option.value }}
                    onPress={() => setSubject(option.value)}
                    testID={`image-quality-subject-${option.value}`}
                  />
                ))}
              </View>
              <AppText variant="caption" color="textMuted">
                {SUBJECTS.find(o => o.value === subject)?.hint}
              </AppText>
            </View>

            {imageUri ? (
              <AppCard variant="filled" testID="image-quality-preview">
                <View style={styles.previewCard}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.preview}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                    accessibilityLabel="Selected image"
                  />
                  {busy ? (
                    <View style={styles.progress} testID="image-quality-progress">
                      <LoadingIndicator message="Analysing…" />
                    </View>
                  ) : (
                    <View style={styles.actions}>
                      <AppButton
                        title="Change image"
                        variant="secondary"
                        style={styles.flex}
                        onPress={() => {
                          quality.reset();
                          setImageUri(null);
                        }}
                        testID="image-quality-change"
                      />
                      <AppButton
                        title={quality.status === 'error' ? 'Try again' : 'Analyse'}
                        style={styles.flex}
                        onPress={() => run(imageUri, subject)}
                        testID="image-quality-analyze"
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
                    onPress={() => navigation.navigate('Scanner', { target: 'ImageQuality' })}
                    testID="image-quality-capture"
                  />
                  <AppButton
                    title="Choose image"
                    variant="secondary"
                    style={styles.flex}
                    loading={gallery.isPicking}
                    onPress={chooseImage}
                    testID="image-quality-choose"
                  />
                </View>
                <EmptyState
                  fullscreen={false}
                  icon="◈"
                  title="No image selected"
                  description="Take or pick a photo. It is analysed on your device and never uploaded."
                />
              </>
            )}
          </>
        )}

        {errorMessage ? (
          <AppText
            variant="caption"
            color="error"
            accessibilityLiveRegion="polite"
            style={styles.hint}
            testID="image-quality-error"
          >
            {errorMessage}
          </AppText>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
