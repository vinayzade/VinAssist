module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|@react-native-async-storage|react-native-gesture-handler|react-native-reanimated|react-native-worklets|react-native-config|react-native-keychain|react-native-vision-camera|react-native-nitro-modules|react-native-nitro-image|react-native-image-picker|@react-native-documents|react-redux|@reduxjs|redux|immer|reselect|redux-thunk)/)',
  ],
};
