module.exports = {
  project: {
    ios: {},
    android: {},
  },
  // Windows: exclude community native modules built for older RNW (0.74).
  // Their Windows targets don't support RNW 0.84 Composition API.
  // JS-side fallbacks handle all functionality (see *.windows.tsx files).
  dependencies: {
    'react-native-video': {
      platforms: { windows: null },
    },
    '@react-native-async-storage/async-storage': {
      platforms: { windows: null },
    },
    '@react-native-community/netinfo': {
      platforms: { windows: null },
    },
    'react-native-config': {
      platforms: { windows: null },
    },
    'react-native-linear-gradient': {
      platforms: { windows: null },
    },
    'react-native-svg': {
      platforms: { windows: null },
    },
  },
  assets: [
    './assets/fonts/',
    './node_modules/react-native-vector-icons/Fonts/',
  ],
};
