import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyles, useTheme } from '@/theme';
import { AppText } from './AppText';

export interface ActionSheetAction {
  key: string;
  label: string;
  glyph?: string;
  /** Painted in the error colour (delete and the like). */
  destructive?: boolean;
  onPress: () => void;
}

export interface ActionSheetProps {
  visible: boolean;
  title?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
  testID?: string;
}

const useStyles = createStyles(t => ({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    paddingHorizontal: t.spacing.md,
    paddingTop: t.spacing.md,
    borderTopLeftRadius: t.radius.xl,
    borderTopRightRadius: t.radius.xl,
    gap: t.spacing.xxs,
  },
  title: { marginBottom: t.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.md,
    minHeight: t.layout.touchTarget + t.spacing.xs,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.md,
  },
  glyph: { width: 24, textAlign: 'center' },
}));

/** Bottom sheet with a short list of actions for one item. */
export function ActionSheet({ visible, title, actions, onClose, testID = 'action-sheet' }: ActionSheetProps) {
  const styles = useStyles();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityLabel="Close menu"
        testID={`${testID}-backdrop`}
      >
        <Pressable onPress={() => undefined}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.surfaceElevated, paddingBottom: spacing.lg + insets.bottom },
            ]}
            testID={testID}
          >
            {title ? (
              <AppText variant="label" color="textMuted" numberOfLines={1} style={styles.title}>
                {title}
              </AppText>
            ) : null}
            {actions.map(action => (
              <Pressable
                key={action.key}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.surfaceSunken : 'transparent' },
                ]}
                testID={`${testID}-${action.key}`}
              >
                {action.glyph ? (
                  <AppText variant="title" color={action.destructive ? 'error' : 'primary'} style={styles.glyph}>
                    {action.glyph}
                  </AppText>
                ) : null}
                <AppText variant="body" color={action.destructive ? 'error' : 'text'}>
                  {action.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
