import React, { useCallback, useState } from 'react';
import { Image, View } from 'react-native';
import { AppButton, AppCard, AppHeader, AppText, ScreenContainer } from '@/components';
import { addHistoryItem } from '@/features/history';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import { getApiErrorMessage, useSaveImageQualityResultMutation } from '@/services/api';
import type { QualityStatus } from '@/services/imageQuality';
import { useAppDispatch } from '@/store/hooks';
import { createStyles, useTheme } from '@/theme';
import { logger } from '@/utils/logger';
import { ScoreBar, toneFor } from '../components/ScoreBar';

const STATUS_LABEL: Record<QualityStatus, string> = {
  GOOD: 'Good quality',
  FAIR: 'Fair quality',
  POOR: 'Poor quality',
};

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  hero: { flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceSunken,
  },
  heroText: { flex: 1, gap: t.spacing.xxs },
  ring: {
    width: 96,
    height: 96,
    borderRadius: t.radius.full,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { gap: t.spacing.md },
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs },
  chip: {
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xxs,
    borderRadius: t.radius.full,
  },
  warnings: { gap: t.spacing.sm },
  warning: { flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' },
  warningText: { flex: 1 },
  actions: { flexDirection: 'row', gap: t.spacing.sm },
  flex: { flex: 1 },
}));

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Scores, checks, warnings and the recommendation for one image. */
export function ImageQualityResultScreen({
  navigation,
  route,
}: MainStackScreenProps<'ImageQualityResult'>) {
  const styles = useStyles();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const { imageUri, result } = route.params;
  const [saveRemote] = useSaveImageQualityResultMutation();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const tone = toneFor(result.overallScore);
  const { checks, metrics } = result;

  const chips: { label: string; ok: boolean; testID: string }[] = [
    { label: checks.blur ? 'Blurry' : 'Sharp', ok: !checks.blur, testID: 'chip-blur' },
    {
      label: checks.lowLight ? 'Low light' : checks.overexposed ? 'Overexposed' : 'Lighting OK',
      ok: !checks.lowLight && !checks.overexposed,
      testID: 'chip-light',
    },
    {
      label: `Resolution ${checks.resolution}`,
      ok: checks.resolution !== 'LOW',
      testID: 'chip-resolution',
    },
    {
      label: checks.faceDetected
        ? checks.multipleFaces
          ? `${result.faceCount} faces`
          : checks.faceOutsideFrame
          ? 'Face cut off'
          : 'Face detected'
        : 'No face',
      ok: checks.faceDetected
        ? !checks.multipleFaces && !checks.faceOutsideFrame
        : result.subject !== 'portrait',
      testID: 'chip-face',
    },
  ];

  const save = useCallback(async () => {
    if (saveStatus === 'saving' || saveStatus === 'saved') {
      return;
    }
    setSaveStatus('saving');
    setSaveError(null);
    dispatch(
      addHistoryItem({
        kind: 'imageQuality',
        title: `${STATUS_LABEL[result.status]} · ${result.overallScore}/100`,
        summary: result.recommendation,
      }),
    );
    try {
      await saveRemote({
        overallScore: result.overallScore,
        status: result.status,
        blurScore: result.blurScore,
        brightnessScore: result.brightnessScore,
        resolutionScore: result.resolutionScore,
        faceScore: result.faceScore,
        faceCount: result.faceCount,
        checks: result.checks,
        warnings: result.warnings.map(w => w.message),
        recommendation: result.recommendation,
        engine: result.engine,
        processingMs: Math.round(metrics.durationMs),
        imageWidth: metrics.width,
        imageHeight: metrics.height,
        sourceUri: imageUri,
      }).unwrap();
      setSaveStatus('saved');
    } catch (error) {
      logger.warn('[imageQuality] remote save failed', error);
      setSaveStatus('error');
      setSaveError(
        'Saved on this device. Could not sync to your account: ' +
          getApiErrorMessage(error as never),
      );
    }
  }, [dispatch, imageUri, metrics, result, saveRemote, saveStatus]);

  return (
    <ScreenContainer edges={['bottom']} scroll testID="image-quality-result-screen">
      <AppHeader title="Quality report" subtitle="Analysed on this device." />

      <View style={styles.content}>
        <View style={styles.hero}>
          <Image
            source={{ uri: imageUri }}
            style={styles.thumbnail}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Analysed image"
          />
          <View style={styles.heroText}>
            <AppText variant="h2" color={tone} testID="quality-status">
              {STATUS_LABEL[result.status]}
            </AppText>
            <AppText variant="bodySmall" color="textSecondary" testID="quality-recommendation">
              {result.recommendation}
            </AppText>
          </View>
          <View style={[styles.ring, { borderColor: colors[tone] }]} accessibilityLabel={`Overall score ${result.overallScore} out of 100`}>
            <AppText variant="h2" color={tone} testID="quality-score">
              {result.overallScore}
            </AppText>
          </View>
        </View>

        <View style={styles.checks} testID="quality-checks">
          {chips.map(chip => (
            <View
              key={chip.testID}
              style={[
                styles.chip,
                { backgroundColor: chip.ok ? colors.successSoft : colors.errorSoft },
              ]}
              testID={chip.testID}
            >
              <AppText variant="caption" color={chip.ok ? 'success' : 'error'}>
                {chip.label}
              </AppText>
            </View>
          ))}
        </View>

        <AppCard variant="filled">
          <View style={styles.bars}>
            <ScoreBar
              label="Sharpness"
              score={result.blurScore}
              detail={`Laplacian variance ${Math.round(metrics.laplacianVariance)}`}
              testID="bar-blur"
            />
            <ScoreBar
              label="Lighting"
              score={result.brightnessScore}
              detail={`Mean brightness ${Math.round(metrics.meanLuma)} / 255 · contrast ${Math.round(
                metrics.lumaStdDev,
              )}`}
              testID="bar-brightness"
            />
            <ScoreBar
              label="Resolution"
              score={result.resolutionScore}
              detail={`${metrics.width} × ${metrics.height} (${(
                (metrics.width * metrics.height) /
                1e6
              ).toFixed(1)} MP)`}
              testID="bar-resolution"
            />
            <ScoreBar
              label="Face"
              score={result.faceScore}
              detail={
                result.faceDetected
                  ? `${result.faceCount} face${result.faceCount === 1 ? '' : 's'} detected`
                  : result.subject === 'portrait'
                  ? 'No face detected'
                  : 'No face (not required for this photo)'
              }
              testID="bar-face"
            />
          </View>
        </AppCard>

        {result.warnings.length > 0 ? (
          <AppCard variant="tinted" testID="quality-warnings">
            <View style={styles.warnings}>
              <AppText variant="overline" color="textMuted">
                Warnings
              </AppText>
              {result.warnings.map(warning => (
                <View key={warning.code} style={styles.warning}>
                  <AppText
                    variant="body"
                    color={warning.severity === 'high' ? 'error' : 'warning'}
                  >
                    •
                  </AppText>
                  <AppText variant="body" style={styles.warningText}>
                    {warning.message}
                  </AppText>
                </View>
              ))}
            </View>
          </AppCard>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            title="Try another"
            variant="secondary"
            style={styles.flex}
            onPress={() => navigation.goBack()}
            testID="quality-retry"
          />
          <AppButton
            title={
              saveStatus === 'saved'
                ? 'Saved'
                : saveStatus === 'error'
                ? 'Saved locally'
                : 'Save report'
            }
            style={styles.flex}
            loading={saveStatus === 'saving'}
            disabled={saveStatus === 'saved'}
            onPress={save}
            testID="quality-save"
          />
        </View>
        {saveError ? (
          <AppText variant="caption" color="warning" testID="quality-save-error">
            {saveError}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textMuted">
          Analysed in {Math.round(metrics.durationMs)} ms · {result.engine}
        </AppText>
      </View>
    </ScreenContainer>
  );
}
