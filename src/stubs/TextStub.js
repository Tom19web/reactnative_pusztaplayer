// Text stub - registers RCTText view config for Windows
import React from 'react';

// Manually register RCTText view config so renderer accepts text children
try {
  const register = require('react-native/Libraries/Renderer/shims/ReactNativeViewConfigRegistry').register;
  const createViewConfig = require('react-native/Libraries/NativeComponent/ViewConfig').createViewConfig;
  register('RCTText', () =>
    createViewConfig({
      uiViewClassName: 'RCTText',
      validAttributes: { isHighlighted: true, isPressable: true, numberOfLines: true, ellipsizeMode: true, allowFontScaling: true, selectable: true, onTextLayout: true },
      directEventTypes: { topTextLayout: { registrationName: 'onTextLayout' } },
    })
  );
} catch {}

const Text = React.forwardRef((props, ref) =>
  React.createElement('RCTText', { ...props, ref }, props.children)
);
export default Text;
