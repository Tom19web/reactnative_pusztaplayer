// Pure noop BridgelessUIManager - no require, no deep imports
const nop = () => {};
const nopArgs = (...a) => {};

const UIManagerJS = {
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
};

module.exports = {
  __esModule: true,
  default: UIManagerJS,
  getFabricUIManager: () => null,
  UIManagerJS,
};
