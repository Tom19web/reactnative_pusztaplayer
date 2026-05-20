const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const fs = require('fs');
const path = require('node:path');

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

const config = {
  resolver: {
    assetExts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ttf', 'otf'],
    blockList: [
      new RegExp(
        `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`,
      ),
      new RegExp(`${rnwPath}/build/.*`),
      new RegExp(`${rnwPath}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
    resolveRequest: (context, moduleName, platform) => {
      if (platform === 'windows') {
        // Windows: stub SafeAreaView_INTERNAL_DO_NOT_USE
        if (moduleName && moduleName.includes('SafeAreaView_INTERNAL')) {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/SafeAreaViewStub.js'),
            type: 'sourceFile',
          };
        }
        // Windows: stub Text
        if (moduleName && moduleName.endsWith('/Text') && !moduleName.includes('TextInput') && !moduleName.includes('/stubs/')) {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/TextStub.js'),
            type: 'sourceFile',
          };
        }
        // Windows: stub BridgelessUIManager
        if (moduleName && moduleName.includes('BridgelessUIManager')) {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/BridgelessUIManager.js'),
            type: 'sourceFile',
          };
        }
        // Windows: stub NativePlatformConstantsWindows
        if (moduleName && moduleName.includes('NativePlatformConstantsWindows')) {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/NativePlatformConstantsWindows.js'),
            type: 'sourceFile',
          };
        }
        // Windows: redirect Platform to polyfill
        if (moduleName && (moduleName.endsWith('Utilities/Platform') || moduleName.endsWith('Utilities/Platform.windows'))) {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/PlatformWin.js'),
            type: 'sourceFile',
          };
        }
        // Windows: stub react-native-svg
        if (moduleName === 'react-native-svg') {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/react-native-svg.tsx'),
            type: 'sourceFile',
          };
        }
        // Windows: stub react-native-linear-gradient
        if (moduleName === 'react-native-linear-gradient') {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/react-native-linear-gradient.tsx'),
            type: 'sourceFile',
          };
        }
        // Windows: stub ReactDevToolsSettingsManager
        if (moduleName && moduleName.includes('ReactDevToolsSettingsManager')) {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/ReactDevToolsSettingsManager.js'),
            type: 'sourceFile',
          };
        }
        // Windows: stub @sentry/react-native
        if (moduleName === '@sentry/react-native') {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/sentry-stub.ts'),
            type: 'sourceFile',
          };
        }
        // Windows: stub ScrollView to View (Fabric crash on class component re-render)
        if (moduleName && moduleName.endsWith('/ScrollView') && !moduleName.includes('/stubs/')) {
          return {
            filePath: path.resolve(__dirname, 'src/stubs/ScrollViewStub.windows.tsx'),
            type: 'sourceFile',
          };
        }
        // Windows: stub BackHandler to prevent addEventListener crash
        if (moduleName && moduleName.endsWith('/BackHandler') && !moduleName.includes('/stubs/')) {
          console.log('[resolveRequest] BackHandler matched:', moduleName);
          return {
            filePath: path.resolve(__dirname, 'src/stubs/BackHandlerStub.windows.ts'),
            type: 'sourceFile',
          };
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
