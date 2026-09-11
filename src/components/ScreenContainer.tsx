import React, { type PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { createStyles, useTheme } from '@/theme';

export interface ScreenContainerProps extends PropsWithChildren {
  /** Safe-area edges to pad. Tab screens use `['top']`; pushed screens `['bottom']`. */
  edges?: Edge[];
  /** Wrap content in a ScrollView. Use for forms and long content. */
  scroll?: boolean;
  /** Lift content above the keyboard. Enabled automatically with `scroll`. */
  keyboardAvoiding?: boolean;
  /** Remove the horizontal screen padding (for full-bleed lists). */
  noPadding?: boolean;
  /** Use the sunken surface instead of the page background. */
  background?: 'background' | 'surface' | 'surfaceSunken';
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle'>;
  testID?: string;
}

const useStyles = createStyles(t => ({
  padded: {
    paddingHorizontal: t.layout.screenPadding,
    paddingTop: t.spacing.sm,
    paddingBottom: t.spacing.md,
  },
  scrollContent: { flexGrow: 1 },
  constrained: {
    width: '100%',
    maxWidth: t.layout.maxContentWidth,
    alignSelf: 'center',
  },
}));

/**
 * Standard page shell: themed background, safe-area handling, consistent
 * horizontal padding, optional scrolling and keyboard avoidance.
 */
export function ScreenContainer({
  edges = ['top', 'bottom'],
  scroll = false,
  keyboardAvoiding = scroll,
  noPadding = false,
  background = 'background',
  style,
  contentContainerStyle,
  scrollProps,
  testID,
  children,
}: ScreenContainerProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const backgroundColor = colors[background];

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={base.flex}
      contentContainerStyle={[
        styles.scrollContent,
        !noPadding && styles.padded,
        contentContainerStyle,
      ]}
      {...scrollProps}
    >
      <View style={[base.flex, styles.constrained]}>{children}</View>
    </ScrollView>
  ) : (
    <View
      style={[
        base.flex,
        styles.constrained,
        !noPadding && styles.padded,
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[base.flex, { backgroundColor }, style]}
      testID={testID}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={base.flex}
          // With edge-to-edge enabled (android/gradle.properties) Android
          // ignores adjustResize, so padding is needed on both platforms.
          behavior="padding"
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

const base = StyleSheet.create({
  flex: { flex: 1 },
});
