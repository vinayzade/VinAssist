import React from 'react';
import { Pressable, View } from 'react-native';
import { AppText, type AppTextColor } from '@/components';
import { createStyles, useTheme } from '@/theme';

export type ChipKind = 'document' | 'image' | 'ocr' | 'analysis' | 'file';

const GLYPHS: Record<ChipKind, string> = {
  document: '≡',
  image: '▣',
  ocr: 'T',
  analysis: '◈',
  file: '≡',
};

export interface AttachmentChipProps {
  kind: ChipKind;
  title: string;
  /** Shown as a small trailing "×" that removes the attachment. */
  onRemove?: () => void;
  /** Paint on the primary bubble (white text) instead of a surface. */
  onPrimary?: boolean;
  muted?: boolean;
  testID?: string;
}

const useStyles = createStyles(t => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    borderRadius: t.radius.full,
    paddingLeft: t.spacing.sm,
    paddingRight: t.spacing.sm,
    paddingVertical: t.spacing.xxs,
    maxWidth: 240,
  },
  title: { flexShrink: 1 },
  remove: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -t.spacing.xxs,
  },
}));

/** A compact label for one piece of attached material. */
export function AttachmentChip({
  kind,
  title,
  onRemove,
  onPrimary = false,
  muted = false,
  testID,
}: AttachmentChipProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const background = onPrimary
    ? 'rgba(255,255,255,0.18)'
    : muted
    ? colors.surfaceSunken
    : colors.primarySoft;
  const color: AppTextColor = onPrimary ? 'onPrimary' : muted ? 'textSecondary' : 'onPrimarySoft';

  return (
    <View style={[styles.chip, { backgroundColor: background }]} testID={testID}>
      <AppText variant="caption" color={color}>
        {GLYPHS[kind]}
      </AppText>
      <AppText variant="caption" color={color} numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title}`}
          style={styles.remove}
          testID={testID ? `${testID}-remove` : undefined}
        >
          <AppText variant="caption" color={color}>
            ×
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
