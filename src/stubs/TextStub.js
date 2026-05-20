// Text stub - registers RCTText, RCTImageView view configs for Windows
import React from 'react';

// Manually register view configs so Fabric renderer accepts components
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
  register('RCTImageView', () =>
    createViewConfig({
      uiViewClassName: 'RCTImageView',
      validAttributes: { src: true, source: true, loadingIndicatorSrc: true, resizeMode: true, tintColor: true, borderRadius: true },
      directEventTypes: { topLoadStart: { registrationName: 'onLoadStart' }, topLoad: { registrationName: 'onLoad' }, topLoadEnd: { registrationName: 'onLoadEnd' }, topProgress: { registrationName: 'onProgress' }, topError: { registrationName: 'onError' }, topPartialLoad: { registrationName: 'onPartialLoad' } },
    })
  );
  register('RCTSinglelineTextInputView', () =>
    createViewConfig({
      uiViewClassName: 'RCTSinglelineTextInputView',
      validAttributes: { allowFontScaling: true, rejectResponderTermination: true, placeholder: true, defaultValue: true },
    })
  );
} catch {}

const Text = React.forwardRef((props, ref) =>
  React.createElement('RCTText', { ...props, ref }, props.children)
);
export default Text;
