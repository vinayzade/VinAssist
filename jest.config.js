module.exports = {
  preset: '@react-native/jest-preset',
  // Full-app flows (navigation + RTK Query + keychain) need more than 5 s on CI.
  testTimeout: 20000,
  setupFiles: ['<rootDir>/jest.renderCounter.js', '<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.rntl.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|@react-native-async-storage|react-native-gesture-handler|react-native-reanimated|react-native-worklets|react-native-config|react-native-keychain|react-native-vision-camera|react-native-nitro-modules|react-native-nitro-image|react-native-image-picker|@react-native-documents|@react-native-clipboard|react-redux|@reduxjs|redux|immer|reselect|redux-thunk)/)',
  ],
};
