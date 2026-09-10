import React from 'react';
import { AppHeader, EmptyState, ScreenContainer } from '@/components';
import type { MainStackScreenProps } from '@/navigation/navigationTypes';

export function ImageQualityScreen({
  route,
}: MainStackScreenProps<'ImageQuality'>) {
  const imageUri = route.params?.imageUri;

  return (
    <ScreenContainer edges={['bottom']}>
      <AppHeader
        title="Image Quality"
        subtitle="Check for blur, exposure problems and sharpness."
      />
      <EmptyState
        icon="◈"
        title={imageUri ? 'Ready to analyse' : 'No image selected'}
        description={
          imageUri
            ? imageUri
            : 'Capture or choose a photo to check its quality.'
        }
      />
    </ScreenContainer>
  );
}
