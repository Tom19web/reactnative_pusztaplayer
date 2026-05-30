// Stub for @sentry/react-native on Windows
const noop = () => undefined;
const noopPromise = () => Promise.resolve();

export const init = noop;
export const wrap = (x: any) => x;
export const captureException = noop;
export const captureMessage = noop;
export const ErrorBoundary = ({ children }: any) => children;
export const withErrorBoundary = (Component: any) => Component;
export const TouchEventBoundary = ({ children }: any) => children;
export const nativeCrash = noop;
export const flush = noopPromise;
export const close = noopPromise;
export const SDK_NAME = 'sentry.windows-stub';
export const SDK_VERSION = '0.0.0';
export const ReactNativeClient = class {};
export default { init, wrap };
