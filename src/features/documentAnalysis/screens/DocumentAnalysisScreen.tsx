import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  DocumentSourcePicker,
  EmptyState,
  ScreenContainer,
} from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import { formatFileSize, type SelectedFile } from '@/services/files';
import { createStyles } from '@/theme';
import { useDocumentUpload } from '../hooks/useDocumentUpload';

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  scanned: { gap: t.spacing.xs },
  uploaded: { gap: t.spacing.xxs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.md },
  mono: { flexShrink: 1, textAlign: 'right' },
  chat: { marginTop: t.spacing.sm },
}));

/**
 * Document Analysis entry point. Today it covers the secure upload step:
 * pick or scan -> validate on device -> upload -> stored record. Analysis
 * of the stored document is the next backend module.
 */
export function DocumentAnalysisScreen({
  navigation,
  route,
}: MainStackScreenProps<'DocumentAnalysis'>) {
  const styles = useStyles();
  const scannedUri = route.params?.imageUri;
  const [file, setFile] = useState<SelectedFile | null>(null);
  const uploader = useDocumentUpload();
  const hasSource = Boolean(file || scannedUri);

  const onFileChange = (next: SelectedFile | null) => {
    uploader.reset();
    setFile(next);
  };

  return (
    <ScreenContainer edges={['bottom']} scroll testID="document-analysis-screen">
      <AppHeader
        title="Document Analysis"
        subtitle="Summarise a document and pull out its key points."
      />

      <View style={styles.content}>
        {scannedUri && !file ? (
          <View style={styles.scanned} testID="scanned-source">
            <AppText variant="overline" color="textMuted">
              Scanned image
            </AppText>
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {scannedUri}
            </AppText>
          </View>
        ) : null}

        <DocumentSourcePicker
          kinds={['pdf', 'image']}
          onChange={onFileChange}
          onScan={() => navigation.navigate('Scanner', { target: 'DocumentAnalysis' })}
        />

        {file && uploader.status !== 'uploaded' ? (
          <AppButton
            title={uploader.status === 'error' ? 'Try upload again' : 'Upload securely'}
            loading={uploader.status === 'uploading'}
            onPress={() => uploader.upload(file)}
            testID="document-upload"
          />
        ) : null}

        {uploader.error ? (
          <AppText
            variant="caption"
            color="error"
            accessibilityLiveRegion="polite"
            testID="document-upload-error"
          >
            {uploader.error}
          </AppText>
        ) : null}

        {uploader.document ? (
          <AppCard variant="tinted" testID="document-uploaded">
            <View style={styles.uploaded}>
              <AppText variant="overline" color="success">
                Uploaded
              </AppText>
              <AppText variant="label" numberOfLines={1}>
                {uploader.document.name}
              </AppText>
              <View style={styles.row}>
                <AppText variant="caption" color="textMuted">
                  {uploader.document.mimeType} ·{' '}
                  {formatFileSize(uploader.document.sizeBytes)} · {uploader.document.status}
                </AppText>
              </View>
              {uploader.document.sha256 ? (
                <AppText
                  variant="caption"
                  color="textMuted"
                  numberOfLines={1}
                  style={styles.mono}
                  testID="document-uploaded-sha"
                >
                  SHA-256 {uploader.document.sha256.slice(0, 16)}…
                </AppText>
              ) : null}
              <AppButton
                title="Chat with this document"
                style={styles.chat}
                onPress={() =>
                  navigation.navigate('DocumentChat', {
                    documentId: uploader.document!.id,
                    name: uploader.document!.name,
                    kind: uploader.document!.kind,
                    localUri: file?.uri,
                  })
                }
                testID="document-chat-open"
              />
            </View>
          </AppCard>
        ) : (
          <EmptyState
            fullscreen={false}
            icon="≡"
            title={hasSource ? 'Ready to upload' : 'No document selected'}
            description={
              hasSource
                ? 'Your file is validated on this device, then stored securely in your account. Analysis is coming soon.'
                : 'Choose a file, pick a photo, or scan a page to get started.'
            }
          />
        )}
      </View>
    </ScreenContainer>
  );
}
