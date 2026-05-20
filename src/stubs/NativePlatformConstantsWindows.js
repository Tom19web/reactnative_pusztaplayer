// Stub for NativePlatformConstantsWindows on Windows
// Avoids TurboModuleRegistry.getEnforcing() at module load time (crashes with "runtime not ready")

const MockPlatformConstants = {
  getConstants() {
    return {
      isTesting: false,
      isDisableAnimations: false,
      reactNativeVersion: { major: 0, minor: 85, patch: 2, prerelease: null },
      reactNativeWindowsVersion: { major: 0, minor: 84, patch: 0 },
      osVersion: 10,
    };
  },
};

export default MockPlatformConstants;
module.exports = { default: MockPlatformConstants };
