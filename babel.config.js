module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@': './src',
        },
        extensions: ['.ios.tsx', '.android.tsx', '.tsx', '.ios.ts', '.android.ts', '.ts', '.js', '.json'],
      },
    ],
    // Reanimated 4 is powered by react-native-worklets. Its Babel plugin
    // transforms `'worklet'` functions and MUST be the last plugin listed.
    'react-native-worklets/plugin',
  ],
};
