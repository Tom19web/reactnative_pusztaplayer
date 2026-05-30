// Pure noop UIManager - no require, no deep imports, just empty methods
// Native views won't be created but the app won't crash or freeze

const nop = () => {};
const nopArgs = (...a) => {};

const UIManager = {
  getViewManagerConfig: () => null,
  hasViewManagerConfig: () => false,
  getConstantsForViewManager: () => ({}),
  getDefaultEventTypes: () => [],
  lazilyLoadView: () => null,
  createView: nopArgs,
  updateView: nopArgs,
  manageChildren: nopArgs,
  setChildren: nopArgs,
  measure: nopArgs,
  measureInWindow: nopArgs,
  measureLayout: nopArgs,
  measureLayoutRelativeToParent: nopArgs,
  findSubviewIn: nopArgs,
  dispatchViewManagerCommand: nopArgs,
  setJSResponder: nopArgs,
  clearJSResponder: nop,
  configureNextLayoutAnimation: nopArgs,
  viewIsDescendantOf: nopArgs,
  focus: nopArgs,
  blur: nopArgs,
  sendAccessibilityEvent: nopArgs,
  setLayoutAnimationEnabledExperimental: nop,
  getConstants: () => ({}),
};

module.exports = { default: UIManager, __esModule: true };
