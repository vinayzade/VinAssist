import React from 'react';
import { AppHeader, EmptyState, ScreenContainer } from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';

export function ImageAnalysisScreen({
  route,
}: MainStackScreenProps<'ImageAnalysis'>) {
  const imageUri = route.params?.imageUri;

  return (
    <ScreenContainer edges={['bottom']}>
      <AppHeader
        title="Image Analysis"
        subtitle="Describe what is in a photo."
      />
      <EmptyState
        icon="◐"
        title={imageUri ? 'Ready to analyse' : 'No image selected'}
        description={
          imageUri
            ? imageUri
            : 'Capture or choose a photo to get a description of its contents.'
        }
      />
    </ScreenContainer>
  );
}
