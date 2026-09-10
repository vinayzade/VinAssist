import React, { useState } from 'react';
import { View } from 'react-native';
import {
  AppHeader,
  AppText,
  DocumentSourcePicker,
  EmptyState,
  ScreenContainer,
} from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';
import type { SelectedFile } from '@/services/files';
import { createStyles } from '@/theme';

const useStyles = createStyles(t => ({
  content: { gap: t.layout.sectionGap },
  scanned: { gap: t.spacing.xs },
}));

export function DocumentAnalysisScreen({
  navigation,
  route,
}: MainStackScreenProps<'DocumentAnalysis'>) {
  const styles = useStyles();
  const scannedUri = route.params?.imageUri;
  const [file, setFile] = useState<SelectedFile | null>(null);
  const hasSource = Boolean(file || scannedUri);

  return (
    <ScreenContainer edges={['bottom']} scroll>
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
            <AppText
              variant="bodySmall"
              color="textSecondary"
              numberOfLines={1}
            >
              {scannedUri}
            </AppText>
          </View>
        ) : null}

        <DocumentSourcePicker
          kinds={['pdf', 'image']}
          onChange={setFile}
          onScan={() =>
            navigation.navigate('Scanner', { target: 'DocumentAnalysis' })
          }
        />

        <EmptyState
          fullscreen={false}
          icon="≡"
          title={hasSource ? 'Ready to analyse' : 'No document selected'}
          description={
            hasSource
              ? 'Analysis is coming soon. Your document stays on this device until you run it.'
              : 'Choose a file, pick a photo, or scan a page to get started.'
          }
        />
      </View>
    </ScreenContainer>
  );
}
