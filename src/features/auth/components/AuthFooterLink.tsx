import React from 'react';
import { AppText } from '@/components';
import { createStyles } from '@/theme';

interface AuthFooterLinkProps {
  prompt: string;
  linkLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

const useStyles = createStyles(t => ({
  root: { marginTop: t.spacing.lg, textAlign: 'center' },
}));

/** "Prompt? Link" line at the bottom of an auth screen. */
export function AuthFooterLink({
  prompt,
  linkLabel,
  onPress,
  disabled,
}: AuthFooterLinkProps) {
  const styles = useStyles();
  return (
    <AppText color="textMuted" style={styles.root}>
      {prompt}{' '}
      <AppText
        color="textLink"
        accessibilityRole="link"
        onPress={disabled ? undefined : onPress}
      >
        {linkLabel}
      </AppText>
    </AppText>
  );
}
