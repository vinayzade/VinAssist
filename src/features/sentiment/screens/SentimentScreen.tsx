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
import { useAnalyzeSentimentMutation } from '@/services/api/aiApi';

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
        <AppCard variant="filled" style={styles.result}>
          <AppText variant="overline" color="textMuted">
            Result
          </AppText>
          <AppText variant="h3">
            {result.label} · {Math.round(result.confidence * 100)}%
          </AppText>
          <AppText color="textSecondary">{result.explanation}</AppText>
        </AppCard>
      ) : null}
    </ScreenContainer>
  );
}
