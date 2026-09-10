import React from 'react';
import { AppHeader, EmptyState, ScreenContainer } from '@/components';

export function VoiceScreen() {
  // Speech capture will be provided by a native module under `@/native`.
  return (
    <ScreenContainer edges={['bottom']}>
      <AppHeader
        title="Voice"
        subtitle="Talk to the assistant instead of typing."
      />
      <EmptyState
        icon="●"
        title="Voice input is not available yet"
        description="This feature is coming soon."
      />
    </ScreenContainer>
  );
}
