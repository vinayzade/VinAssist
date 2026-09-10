import React from 'react';
import { View } from 'react-native';
import { useFileSelection, type FileSelection } from '@/hooks/useFileSelection';
import type { FileKind } from '@/services/files';
import { createStyles } from '@/theme';
import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { SelectedFileCard } from './SelectedFileCard';

export interface DocumentSourcePickerProps {
  /** Which kinds the file browser should offer. Defaults to PDF + images. */
  kinds?: readonly FileKind[];
  /** Called after a valid file is chosen, and with null when removed. */
  onChange?: (file: FileSelection['file']) => void;
  /** Optional camera entry point; hidden when omitted. */
  onScan?: () => void;
  /** Externally supplied selection state (to share between components). */
  selection?: FileSelection;
  testID?: string;
}

const useStyles = createStyles(t => ({
  root: { gap: t.spacing.sm },
  row: { flexDirection: 'row', gap: t.spacing.sm },
  flex: { flex: 1 },
  hint: { marginTop: t.spacing.xxs },
}));

/**
 * The standard "where does the document come from" block: file browser,
 * photo library, and optionally the camera. Shows the chosen file with a
 * remove action, and validation errors inline. Never uploads.
 */
export function DocumentSourcePicker({
  kinds = ['pdf', 'image'],
  onChange,
  onScan,
  selection: external,
  testID = 'document-source',
}: DocumentSourcePickerProps) {
  const styles = useStyles();
  const internal = useFileSelection({ kinds });
  const selection = external ?? internal;
  const { file, isSelecting, error, pickDocument, pickImage, clear } =
    selection;
  const allowsImages = kinds.includes('image');

  const choose = async (pick: () => Promise<FileSelection['file']>) => {
    const picked = await pick();
    if (picked) {
      onChange?.(picked);
    }
  };

  if (file) {
    return (
      <View style={styles.root} testID={testID}>
        <SelectedFileCard
          file={file}
          onRemove={() => {
            clear();
            onChange?.(null);
          }}
          testID={`${testID}-file`}
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID={testID}>
      <AppButton
        title={allowsImages ? 'Choose a PDF or image' : 'Choose a PDF'}
        loading={isSelecting}
        onPress={() => choose(pickDocument)}
        testID={`${testID}-browse`}
      />
      <View style={styles.row}>
        {allowsImages ? (
          <AppButton
            title="Photo library"
            variant="secondary"
            style={styles.flex}
            disabled={isSelecting}
            onPress={() => choose(pickImage)}
            testID={`${testID}-gallery`}
          />
        ) : null}
        {onScan ? (
          <AppButton
            title="Scan"
            variant="secondary"
            style={styles.flex}
            disabled={isSelecting}
            onPress={onScan}
            testID={`${testID}-scan`}
          />
        ) : null}
      </View>
      {error ? (
        <AppText
          variant="caption"
          color="error"
          accessibilityLiveRegion="polite"
          testID={`${testID}-error`}
        >
          {error}
        </AppText>
      ) : (
        <AppText variant="caption" color="textMuted" style={styles.hint}>
          PDF up to 20 MB, images up to 10 MB.
        </AppText>
      )}
    </View>
  );
}
