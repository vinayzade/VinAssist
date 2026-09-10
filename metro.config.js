const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {
  wrapWithReanimatedMetroConfig,
} = require('react-native-reanimated/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {};

// The Reanimated wrapper collapses library frames in worklet stack traces so
// errors point at app code instead of Reanimated internals.
module.exports = wrapWithReanimatedMetroConfig(
  mergeConfig(getDefaultConfig(__dirname), config),
);
