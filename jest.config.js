module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-qrcode-svg|@react-native-async-storage|@react-native-community|react-native-safe-area-context|react-native-svg|react-native-linear-gradient|react-native-video)/)',
  ],
  moduleNameMapper: {
    '^@sentry/react-native$': '<rootDir>/__mocks__/@sentry/react-native.js',
  },
};
