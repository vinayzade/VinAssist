import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Provider } from 'react-redux';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppText,
  AppTextInput,
  EmptyState,
  ErrorView,
  LoadingIndicator,
  ScreenContainer,
} from '@/components';
import { setupStore } from '@/store';
import {
  ThemeProvider,
  darkTheme,
  lightTheme,
  useTheme,
  type Theme,
} from '@/theme';

function renderWith(theme: Theme, ui: React.ReactElement) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <Provider store={setupStore()}>
        <ThemeProvider theme={theme}>{ui}</ThemeProvider>
      </Provider>,
    );
  });
  return tree;
}

const COLOR = /^(#[0-9a-f]{6}|rgba?\(.+\)|transparent)$/i;

describe('theme tokens', () => {
  it.each([lightTheme, darkTheme])(
    'every $mode colour is a valid colour string',
    theme => {
      for (const [name, value] of Object.entries(theme.colors)) {
        expect({ name, value }).toEqual({
          name,
          value: expect.stringMatching(COLOR),
        });
      }
    },
  );

  it('light and dark define the same semantic roles', () => {
    expect(Object.keys(darkTheme.colors).sort()).toEqual(
      Object.keys(lightTheme.colors).sort(),
    );
    expect(Object.keys(darkTheme.shadows)).toEqual(
      Object.keys(lightTheme.shadows),
    );
  });

  it('ThemeProvider exposes the forced theme', () => {
    let seen: Theme | undefined;
    function Probe() {
      seen = useTheme();
      return null;
    }
    renderWith(darkTheme, <Probe />);
    expect(seen?.mode).toBe('dark');
    expect(seen?.colors.background).toBe(darkTheme.colors.background);
  });
});

describe('components', () => {
  const gallery = (
    <ScreenContainer scroll>
      <AppHeader title="Title" subtitle="Subtitle" onBackPress={() => {}} />
      <AppHeader title="Compact" size="compact" divider />
      <AppText variant="h1">Heading</AppText>
      <AppText color="textMuted">Body</AppText>
      <AppButton title="Primary" onPress={() => {}} />
      <AppButton title="Secondary" variant="secondary" size="sm" />
      <AppButton title="Ghost" variant="ghost" fullWidth={false} />
      <AppButton title="Danger" variant="danger" />
      <AppButton title="Link" variant="link" />
      <AppButton title="Loading" loading />
      <AppTextInput label="Email" placeholder="you@example.com" />
      <AppTextInput label="Bad" errorText="Required" />
      <AppTextInput label="Notes" multiline helperText="Optional" />
      <AppTextInput label="Locked" editable={false} />
      <AppCard>
        <AppText>Elevated</AppText>
      </AppCard>
      <AppCard variant="outlined" onPress={() => {}}>
        <AppText>Pressable outlined</AppText>
      </AppCard>
      <AppCard variant="tinted" padding="lg">
        <AppText>Tinted</AppText>
      </AppCard>
      <LoadingIndicator message="Loading" />
      <LoadingIndicator fullscreen />
      <ErrorView error={new Error('Boom')} onRetry={() => {}} />
      <ErrorView error={{ status: 500, data: 'Server down' }} />
      <EmptyState
        title="Nothing here"
        description="Add something"
        action={{ title: 'Add', onPress: () => {} }}
        secondaryAction={{ title: 'Later', onPress: () => {} }}
      />
    </ScreenContainer>
  );

  it.each([lightTheme, darkTheme])('renders the gallery in $mode', theme => {
    const tree = renderWith(theme, gallery);
    const hostsWithTestId = (testID: string) =>
      tree.root.findAll(
        node => typeof node.type === 'string' && node.props.testID === testID,
      );
    expect(hostsWithTestId('error-view')).toHaveLength(2);
    expect(hostsWithTestId('empty-state')).toHaveLength(1);
    expect(hostsWithTestId('loading-indicator')).toHaveLength(2);
    act(() => tree.unmount());
  });

  it('shows the error message from an RTK Query error', () => {
    const tree = renderWith(
      lightTheme,
      <ErrorView error={{ status: 500, data: 'Server down' }} />,
    );
    const texts = tree.root
      .findAllByType('Text' as never)
      .map(node => String(node.props.children));
    expect(texts).toContain('Server down');
  });

  it('AppButton is disabled while loading', () => {
    const onPress = jest.fn();
    const tree = renderWith(
      lightTheme,
      <AppButton title="Go" loading onPress={onPress} />,
    );
    const button = tree.root.findByProps({ accessibilityRole: 'button' });
    expect(button.props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
  });
});
