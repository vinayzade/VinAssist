import React from 'react';
import { View } from 'react-native';
import { AppCard, AppText } from '@/components';
import { createStyles } from '@/theme';
import type { DashboardAction } from '../types';
import { GlyphBadge } from './GlyphBadge';

interface ToolCardProps {
  tool: DashboardAction;
  onPress: (tool: DashboardAction) => void;
}

const useStyles = createStyles(t => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  text: { flex: 1, gap: t.spacing.xxs },
}));

/** Full-width row for the AI Tools list. */
export function ToolCard({ tool, onPress }: ToolCardProps) {
  const styles = useStyles();

  return (
    <AppCard
      variant="outlined"
      onPress={() => onPress(tool)}
      accessibilityLabel={
        tool.description ? `${tool.title}. ${tool.description}` : tool.title
      }
      testID={`tool-${tool.id}`}
    >
      <View style={styles.row}>
        <GlyphBadge glyph={tool.glyph} tone={tool.tone} />
        <View style={styles.text}>
          <AppText variant="title">{tool.title}</AppText>
          {tool.description ? (
            <AppText
              variant="bodySmall"
              color="textSecondary"
              numberOfLines={2}
            >
              {tool.description}
            </AppText>
          ) : null}
        </View>
        <AppText variant="h3" color="iconMuted">
          ›
        </AppText>
      </View>
    </AppCard>
  );
}
