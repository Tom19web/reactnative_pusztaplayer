// Pre-initialized Platform polyfill for Windows

console.log('[PlatformWin] polyfill loaded, OS=', 'windows');

const Platform = {
  OS: 'windows',
  Version: 10,
  constants: {
    isTesting: false,
    reactNativeVersion: { major: 0, minor: 85, patch: 2, prerelease: null },
  },
  get isTesting() { return false; },
  get isDisableAnimations() { return false; },
  get isTV() { return false; },
  select: (spec) => {
    if ('windows' in spec) return spec.windows;
    if ('native' in spec) return spec.native;
    if ('default' in spec) return spec.default;
    if (__DEV__) console.warn('[PlatformWin] select: no matching key for', Object.keys(spec));
    return undefined;
  },
};

module.exports = { Platform, default: Platform };
