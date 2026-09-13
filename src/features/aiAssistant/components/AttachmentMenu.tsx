import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCard, AppText } from '@/components';
import { createStyles, useTheme } from '@/theme';

export type AttachmentChoice = 'camera' | 'gallery' | 'document';

export interface AttachmentMenuProps {
  visible: boolean;
  onChoose: (choice: AttachmentChoice) => void;
  onClose: () => void;
}

const OPTIONS: { key: AttachmentChoice; glyph: string; label: string; hint: string }[] = [
  { key: 'camera', glyph: '◉', label: 'Take a photo', hint: 'Snap a document, receipt or card' },
  { key: 'gallery', glyph: '▣', label: 'Choose a photo', hint: 'From your photo library' },
  { key: 'document', glyph: '≡', label: 'Choose a file', hint: 'PDF or image, up to 20 MB' },
];

const useStyles = createStyles(t => ({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    gap: t.spacing.xs,
    padding: t.spacing.md,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
  },
  title: { marginBottom: t.spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
}));

/** Bottom sheet listing where the material can come from. */
export function AttachmentMenu({ visible, onChoose, onClose }: AttachmentMenuProps) {
  const styles = useStyles();
  const { colors, spacing } = useTheme();
  // Edge-to-edge Android draws under the system nav bar; keep the last
  // option above it.
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityLabel="Close attachment menu"
        testID="attachment-menu-backdrop"
      >
        <Pressable onPress={() => undefined}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surfaceElevated, paddingBottom: spacing.xl + insets.bottom },
            ]}
            testID="attachment-menu"
          >
            <AppText variant="label" color="textMuted" style={styles.title}>
              Attach
            </AppText>
            {OPTIONS.map(option => (
              <AppCard
                key={option.key}
                variant="outlined"
                padding="sm"
                onPress={() => onChoose(option.key)}
                accessibilityLabel={option.label}
                testID={`attachment-menu-${option.key}`}
              >
                <View style={styles.row}>
                  <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
                    <AppText variant="title" color="onPrimarySoft">
                      {option.glyph}
                    </AppText>
                  </View>
                  <View style={styles.text}>
                    <AppText variant="label">{option.label}</AppText>
                    <AppText variant="caption" color="textMuted">
                      {option.hint}
                    </AppText>
                  </View>
                </View>
              </AppCard>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
