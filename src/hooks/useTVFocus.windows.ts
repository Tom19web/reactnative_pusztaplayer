import { useState, useCallback } from 'react';
import { NativeSyntheticEvent } from 'react-native';

/**
 * Hook for tracking focus state on Pressable/View.
 *
 * On Windows, the standard onFocus/onBlur events may not fire (they are
 * Android TV / Apple TV specific). This hook supplements them with mouse
 * events for Windows desktop support.
 */
export function useTVFocus(initial = false) {
  const [isFocused, setIsFocused] = useState(initial);

  const onFocus = useCallback((_e: NativeSyntheticEvent<{}>) => {
    setIsFocused(true);
  }, []);

  const onBlur = useCallback((_e: NativeSyntheticEvent<{}>) => {
    setIsFocused(false);
  }, []);

  const onMouseEnter = useCallback(() => {
    setIsFocused(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    setIsFocused(false);
  }, []);

  return { isFocused, onFocus, onBlur, onMouseEnter, onMouseLeave };
}
