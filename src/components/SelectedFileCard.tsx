import React from 'react';
import { View } from 'react-native';
import { formatFileSize, type SelectedFile } from '@/services/files';
import { createStyles } from '@/theme';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppText } from './AppText';

interface SelectedFileCardProps {
  file: SelectedFile;
  onRemove?: () => void;
  testID?: string;
}

const useStyles = createStyles(t => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  badge: {
    width: 44,
    height: 44,
    borderRadius: t.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.primarySoft,
  },
  text: { flex: 1, gap: t.spacing.xxs },
}));

/** Summary of a validated file: kind badge, name, size and type. */
export function SelectedFileCard({
  file,
  onRemove,
  testID = 'selected-file',
}: SelectedFileCardProps) {
  const styles = useStyles();
  const meta = [file.extension.toUpperCase(), formatFileSize(file.size)];
  if (file.width && file.height) {
    meta.push(`${file.width}×${file.height}`);
  }

  return (
    <AppCard variant="filled" testID={testID}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <AppText variant="label" color="onPrimarySoft">
            {file.kind === 'pdf' ? 'PDF' : 'IMG'}
          </AppText>
        </View>
        <View style={styles.text}>
          <AppText variant="label" numberOfLines={1}>
            {file.name}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {meta.join(' · ')}
          </AppText>
        </View>
        {onRemove ? (
          <AppButton
            title="Remove"
            variant="link"
            size="sm"
            onPress={onRemove}
            testID={`${testID}-remove`}
          />
        ) : null}
      </View>
    </AppCard>
  );
}
