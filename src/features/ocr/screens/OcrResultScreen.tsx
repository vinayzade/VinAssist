import React from 'react';
import { Image, View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  EmptyState,
  ScreenContainer,
} from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import type { SummaryMode } from '@/services/api';
import { createStyles } from '@/theme';
import { ExtractedFields } from '../components/ExtractedFields';
import { useOcrActions } from '../hooks/useOcrActions';

const SUMMARY_MODES: { value: SummaryMode; label: string }[] = [
  { value: 'quick', label: 'Quick' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'bullet_points', label: 'Bullets' },
  { value: 'action_items', label: 'Actions' },
];

const MODE_TITLES: Record<SummaryMode, string> = {
  quick: 'Quick summary',
  detailed: 'Detailed summary',
  bullet_points: 'Key points',
  action_items: 'Action items',
};

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  thumbnailRow: { flexDirection: 'row', gap: t.spacing.md, alignItems: 'center' },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSunken,
  },
  meta: { flex: 1, gap: t.spacing.xxs },
  textCard: { gap: t.spacing.sm },
  text: { lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
  action: { flexGrow: 1, flexBasis: '30%' },
  aiRow: { flexDirection: 'row', gap: t.spacing.sm },
  flex: { flex: 1 },
  modes: { flexDirection: 'row', gap: t.spacing.xs },
  mode: { flex: 1 },
  summary: { gap: t.spacing.sm },
  summaryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bullet: { flexDirection: 'row', gap: t.spacing.sm },
  bulletText: { flex: 1 },
}));

function formatConfidence(value: number | undefined): string | null {
  return typeof value === 'number' ? `${Math.round(value * 100)}% confidence` : null;
}

/** Shows recognised text with copy / share / save / ask AI / summarise. */
export function OcrResultScreen({
  navigation,
  route,
}: MainStackScreenProps<'OCRResult'>) {
  const styles = useStyles();
  const { imageUri, result } = route.params;
  const actions = useOcrActions(result, imageUri);
  const isEmpty = result.text.trim().length === 0;

  const metaParts = [
    `${result.stats.wordCount} words`,
    `${result.stats.lineCount} lines`,
    formatConfidence(result.stats.meanConfidence),
    result.stats.language ? result.stats.language.toUpperCase() : null,
    `${Math.round(result.durationMs)} ms on device`,
  ].filter(Boolean);

  const askAi = () =>
    navigation.navigate('Tabs', {
      screen: 'AIAssistant',
      params: { prefill: result.text },
    });

  return (
    <ScreenContainer edges={['bottom']} scroll testID="ocr-result-screen">
      <AppHeader title="Extracted text" subtitle="Recognised on this device." />

      <View style={styles.content}>
        <View style={styles.thumbnailRow}>
          <Image
            source={{ uri: imageUri }}
            style={styles.thumbnail}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            accessibilityLabel="Source image"
          />
          <View style={styles.meta}>
            <AppText variant="label">{result.engine}</AppText>
            <AppText variant="caption" color="textMuted" testID="ocr-result-meta">
              {metaParts.join(' · ')}
            </AppText>
          </View>
        </View>

        {isEmpty ? (
          <EmptyState
            fullscreen={false}
            icon="T"
            title="No text found"
            description="Try a sharper, well-lit photo with the text filling the frame."
            action={{ title: 'Try another image', onPress: () => navigation.goBack() }}
            testID="ocr-result-empty"
          />
        ) : (
          <>
            <AppCard variant="filled" testID="ocr-result-text-card">
              <View style={styles.textCard}>
                <AppText variant="overline" color="textMuted">
                  Text
                </AppText>
                <AppText variant="body" style={styles.text} selectable testID="ocr-result-text">
                  {result.text}
                </AppText>
              </View>
            </AppCard>

            <View style={styles.actions}>
              <AppButton
                title={actions.copied ? 'Copied' : 'Copy'}
                variant="secondary"
                style={styles.action}
                onPress={actions.copy}
                testID="ocr-copy"
              />
              <AppButton
                title="Share"
                variant="secondary"
                style={styles.action}
                onPress={actions.share}
                testID="ocr-share"
              />
              <AppButton
                title={
                  actions.saveStatus === 'saved'
                    ? 'Saved'
                    : actions.saveStatus === 'error'
                    ? 'Saved locally'
                    : 'Save'
                }
                variant="secondary"
                style={styles.action}
                loading={actions.saveStatus === 'saving'}
                disabled={actions.saveStatus === 'saved'}
                onPress={actions.save}
                testID="ocr-save"
              />
            </View>
            {actions.saveError ? (
              <AppText variant="caption" color="warning" testID="ocr-save-error">
                {actions.saveError}
              </AppText>
            ) : null}

            <AppButton
              title="Extract fields"
              loading={actions.isExtracting}
              onPress={actions.extract}
              testID="ocr-extract"
            />
            {actions.extractionError ? (
              <AppText
                variant="caption"
                color="error"
                accessibilityLiveRegion="polite"
                testID="ocr-extract-error"
              >
                {actions.extractionError}
              </AppText>
            ) : null}
            {actions.extraction ? (
              <ExtractedFields
                result={actions.extraction}
                onCopy={actions.copyExtraction}
                testID="ocr-extraction"
              />
            ) : null}

            <View style={styles.aiRow}>
              <AppButton
                title="Ask AI"
                style={styles.flex}
                onPress={askAi}
                testID="ocr-ask-ai"
              />
              <AppButton
                title="Summarize"
                variant="secondary"
                style={styles.flex}
                loading={actions.isSummarizing}
                onPress={() => actions.summarize()}
                testID="ocr-summarize"
              />
            </View>
            <View style={styles.modes} testID="ocr-summary-modes">
              {SUMMARY_MODES.map(mode => (
                <AppButton
                  key={mode.value}
                  title={mode.label}
                  size="sm"
                  variant={actions.summaryMode === mode.value ? 'primary' : 'ghost'}
                  style={styles.mode}
                  disabled={actions.isSummarizing}
                  accessibilityState={{ selected: actions.summaryMode === mode.value }}
                  onPress={() => actions.summarize(mode.value)}
                  testID={`ocr-summary-mode-${mode.value}`}
                />
              ))}
            </View>

            {actions.summaryError ? (
              <AppText
                variant="caption"
                color="error"
                accessibilityLiveRegion="polite"
                testID="ocr-summary-error"
              >
                {actions.summaryError}
              </AppText>
            ) : null}

            {actions.summary ? (
              <AppCard variant="tinted" testID="ocr-summary">
                <View style={styles.summary}>
                  <View style={styles.summaryHead}>
                    <AppText variant="overline" color="textMuted" testID="ocr-summary-title">
                      {MODE_TITLES[actions.summary.mode]}
                    </AppText>
                    <AppButton
                      title="Copy"
                      variant="link"
                      size="sm"
                      onPress={actions.copySummary}
                      testID="ocr-summary-copy"
                    />
                  </View>
                  {actions.summary.items.length > 0 ? (
                    actions.summary.items.map((item, index) => (
                      <View key={index} style={styles.bullet}>
                        <AppText variant="body" color="primary">
                          {actions.summary?.mode === 'action_items' ? '☐' : '•'}
                        </AppText>
                        <AppText variant="body" style={styles.bulletText} selectable>
                          {item}
                        </AppText>
                      </View>
                    ))
                  ) : (
                    <AppText variant="body" selectable testID="ocr-summary-text">
                      {actions.summary.summary}
                    </AppText>
                  )}
                  <AppText variant="caption" color="textMuted" testID="ocr-summary-meta">
                    {actions.summary.modelName} · {actions.summary.processingMs} ms
                  </AppText>
                </View>
              </AppCard>
            ) : null}
          </>
        )}
      </View>
    </ScreenContainer>
  );
}
