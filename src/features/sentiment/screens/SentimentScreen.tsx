import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  AppTextInput,
  ErrorView,
  ScreenContainer,
} from '@/components';
import { createStyles } from '@/theme';
import {
  useAnalyzeSentimentMutation,
  type SentimentLabel,
} from '@/services/api/aiApi';

const LABELS: Record<SentimentLabel, { title: string; color: 'success' | 'warning' | 'error' }> = {
  POSITIVE: { title: 'Positive', color: 'success' },
  NEUTRAL: { title: 'Neutral', color: 'warning' },
  NEGATIVE: { title: 'Negative', color: 'error' },
};

const useStyles = createStyles(t => ({
  form: { gap: t.spacing.md },
  result: { marginTop: t.spacing.lg, gap: t.spacing.xs },
}));

export function SentimentScreen() {
  const styles = useStyles();
  const [text, setText] = useState('');
  const [analyzeSentiment, { data: result, error, isLoading: loading }] =
    useAnalyzeSentimentMutation();

  const analyze = () => {
    if (text.trim()) {
      analyzeSentiment({ text: text.trim() });
    }
  };

  return (
    <ScreenContainer edges={['bottom']} scroll>
      <AppHeader
        title="Sentiment"
        subtitle="Paste any text to detect its tone."
      />

      <View style={styles.form}>
        <AppTextInput
          multiline
          placeholder="Type or paste text…"
          value={text}
          onChangeText={setText}
        />
        <AppButton
          title="Analyse"
          loading={loading}
          disabled={!text.trim()}
          onPress={analyze}
        />
      </View>

      {error ? (
        <ErrorView
          fullscreen={false}
          title="Analysis failed"
          error={error}
          onRetry={analyze}
        />
      ) : null}

      {result ? (
        <AppCard variant="filled" style={styles.result} testID="sentiment-result">
          <AppText variant="overline" color="textMuted">
            Result
          </AppText>
          <AppText variant="h3" color={LABELS[result.sentiment].color} testID="sentiment-label">
            {LABELS[result.sentiment].title} · {Math.round(result.confidence * 100)}%
          </AppText>
          {result.explanation ? (
            <AppText color="textSecondary">{result.explanation}</AppText>
          ) : null}
          <AppText variant="caption" color="textMuted" testID="sentiment-meta">
            {result.model} · {result.processingMs} ms
          </AppText>
        </AppCard>
      ) : null}
    </ScreenContainer>
  );
}
