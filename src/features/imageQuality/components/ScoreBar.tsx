import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components';
import { createStyles, useTheme } from '@/theme';

interface ScoreBarProps {
  label: string;
  /** 0-100, or null when the check did not apply. */
  score: number | null;
  detail?: string;
  testID?: string;
}

const useStyles = createStyles(t => ({
  root: { gap: t.spacing.xxs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: {
    height: 8,
    borderRadius: t.radius.full,
    backgroundColor: t.colors.surfaceSunken,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: t.radius.full },
}));

export function toneFor(score: number): 'success' | 'warning' | 'error' {
  if (score >= 75) {
    return 'success';
  }
  if (score >= 50) {
    return 'warning';
  }
  return 'error';
}

/** One labelled 0-100 meter, coloured by band. */
export function ScoreBar({ label, score, detail, testID }: ScoreBarProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tone = score === null ? 'textMuted' : toneFor(score);

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.head}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="label" color={tone === 'textMuted' ? 'textMuted' : tone}>
          {score === null ? 'n/a' : `${score}`}
        </AppText>
      </View>
      <View style={styles.track} accessibilityRole="progressbar">
        <View
          style={[
            styles.fill,
            { width: `${score ?? 0}%`, backgroundColor: colors[tone] },
          ]}
        />
      </View>
      {detail ? (
        <AppText variant="caption" color="textMuted">
          {detail}
        </AppText>
      ) : null}
    </View>
  );
}
