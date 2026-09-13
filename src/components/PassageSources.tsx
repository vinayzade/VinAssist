import React, { useState } from 'react';
import { View } from 'react-native';
import { createStyles, useTheme } from '@/theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';

/** The minimum a retrieved passage needs to be listed under an answer. */
export interface PassageSource {
  chunkId: string;
  chunkIndex: number;
  text: string;
  /** Cosine similarity to the question, 0-1. */
  similarity: number;
  /** True when the answer cites this passage as [n]. */
  cited: boolean;
  documentName?: string | null;
}

export interface PassageSourcesProps {
  sources: PassageSource[];
  testID: string;
}

const useStyles = createStyles(t => ({
  sources: { gap: t.spacing.xs, marginTop: t.spacing.xs },
  source: {
    borderRadius: t.radius.md,
    padding: t.spacing.sm,
    gap: t.spacing.xxs,
  },
  sourceHead: { flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.sm },
  sourceLabel: { flexShrink: 1 },
}));

/**
 * Passages an answer was grounded in. Cited passages are shown by default;
 * the rest can be expanded so the user can judge what the model saw.
 */
export function PassageSources({ sources, testID }: PassageSourcesProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const cited = sources.filter(s => s.cited);
  const shown = open ? sources : cited.length > 0 ? cited : sources.slice(0, 1);

  return (
    <View style={styles.sources} testID={testID}>
      <AppText variant="caption" color="textMuted">
        Sources: {cited.length > 0 ? `${cited.length} cited` : 'none cited'} · {sources.length} retrieved
      </AppText>
      {shown.map(source => (
        <View
          key={source.chunkId}
          style={[styles.source, { backgroundColor: source.cited ? colors.primarySoft : colors.surfaceSunken }]}
          testID={`${testID}-chunk-${source.chunkIndex}`}
        >
          <View style={styles.sourceHead}>
            <AppText
              variant="caption"
              color={source.cited ? 'primary' : 'textMuted'}
              style={styles.sourceLabel}
              numberOfLines={1}
            >
              [{sources.indexOf(source) + 1}] Passage {source.chunkIndex + 1}
              {source.documentName ? ` · ${source.documentName}` : ''}
              {source.cited ? ' · cited' : ''}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {Math.round(source.similarity * 100)}% match
            </AppText>
          </View>
          <AppText variant="caption" color="textSecondary" numberOfLines={open ? undefined : 3}>
            {source.text}
          </AppText>
        </View>
      ))}
      {sources.length > shown.length || open ? (
        <AppButton
          title={open ? 'Show fewer' : `Show all ${sources.length} passages`}
          variant="link"
          size="sm"
          fullWidth={false}
          onPress={() => setOpen(v => !v)}
          testID={`${testID}-toggle`}
        />
      ) : null}
    </View>
  );
}
