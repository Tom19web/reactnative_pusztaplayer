import { useRef, useEffect } from 'react';
import { View, findNodeHandle, UIManager, Platform } from 'react-native';

interface TVFocusWrapperProps {
  children: React.ReactElement;
  hasTVPreferredFocus?: boolean;
  focusable?: boolean;
}

/**
 * Wraps a component to give it TV focus support.
 * On Windows, UIManager.dispatchViewManagerCommand and hasTVPreferredFocus
 * are not supported. We skip imperative focus and let the XAML framework
 * handle focus natively (mouse hover, Tab keyboard navigation).
 */
export default function TVFocusWrapper({
  children,
  hasTVPreferredFocus,
  focusable,
}: TVFocusWrapperProps) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS === 'windows') return;

    if (hasTVPreferredFocus && ref.current) {
      const handle = findNodeHandle(ref.current);
      if (handle) {
        try {
          UIManager.dispatchViewManagerCommand(handle, 'focus', undefined);
        } catch (e) {
          if (__DEV__) console.warn('[TVFocusWrapper] focus command failed:', e);
        }
      }
    }
  }, [hasTVPreferredFocus]);

  return (
    <View
      ref={ref}
      focusable={Platform.OS !== 'windows' ? focusable : undefined}
      {...(Platform.isTV && hasTVPreferredFocus ? { hasTVPreferredFocus: true } : {})}
    >
      {children}
    </View>
  );
}
