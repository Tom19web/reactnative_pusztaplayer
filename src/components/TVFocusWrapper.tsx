import { useRef, useEffect } from 'react';
import { View, findNodeHandle, UIManager, Platform } from 'react-native';

interface TVFocusWrapperProps {
  children: React.ReactElement;
  hasTVPreferredFocus?: boolean;
  focusable?: boolean;
}

/**
 * Wraps a component to give it TV focus support.
 * - `hasTVPreferredFocus`: requests initial focus on mount (Android TV)
 * - Manually calls focus() on mount since enableImperativeFocus is needed
 */
export default function TVFocusWrapper({
  children,
  hasTVPreferredFocus,
  focusable = true,
}: TVFocusWrapperProps) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (hasTVPreferredFocus && ref.current) {
      // Try imperative focus (works if enableImperativeFocus flag is on)
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
      focusable={focusable}
      {...(Platform.isTV && hasTVPreferredFocus ? { hasTVPreferredFocus: true } : {})}
    >
      {children}
    </View>
  );
}
