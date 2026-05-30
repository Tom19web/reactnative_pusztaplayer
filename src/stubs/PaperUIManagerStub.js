// PaperUIManager stub for Windows - delegates to native module
console.log('[PaperUIManager Stub] loaded');

// Try to get the real native UIManager, fall back to mock
let NativeUIManager;
try {
  NativeUIManager = require('../../src/private/specs_DEPRECATED/modules/NativeUIManager').default;
} catch {
  NativeUIManager = {
    getConstants: () => ({}),
    createView: () => {},
    updateView: () => {},
    manageChildren: () => {},
    setChildren: () => {},
    measure: () => {},
    measureInWindow: () => {},
    measureLayout: () => {},
    measureLayoutRelativeToParent: () => {},
    findSubviewIn: () => {},
    dispatchViewManagerCommand: () => {},
    setJSResponder: () => {},
    clearJSResponder: () => {},
    configureNextLayoutAnimation: () => {},
    viewIsDescendantOf: () => {},
    getConstantsForViewManager: () => null,
    getDefaultEventTypes: () => [],
    lazilyLoadView: () => null,
    focus: () => {},
    blur: () => {},
  };
}

const UIManagerJS = {
  ...NativeUIManager,
  createView: (reactTag, viewName, rootTag, props) => {
    if (NativeUIManager.createView) {
      NativeUIManager.createView(reactTag, viewName, rootTag, props);
    }
  },
  updateView: (reactTag, viewName, props) => {
    if (NativeUIManager.updateView) {
      NativeUIManager.updateView(reactTag, viewName, props);
    }
  },
  getConstants: () => NativeUIManager.getConstants ? NativeUIManager.getConstants() : {},
  getViewManagerConfig: (name) => NativeUIManager.getConstantsForViewManager ? NativeUIManager.getConstantsForViewManager(name) : null,
  hasViewManagerConfig: (name) => {
    if (NativeUIManager.getConstantsForViewManager) {
      return NativeUIManager.getConstantsForViewManager(name) != null;
    }
    return false;
  },
};

module.exports = { default: UIManagerJS, __esModule: true };
