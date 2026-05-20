import { useState, useCallback } from 'react';
import { NativeSyntheticEvent, ViewProps } from 'react-native';

/**
 * Hook for tracking TV focus state on Pressable/View.
 * Standard RN doesn't have `focused` in Pressable style callback,
 * so we track it manually via onFocus/onBlur.
 */
export function useTVFocus(initial = false) {
  const [isFocused, setIsFocused] = useState(initial);

  const onFocus = useCallback((e: NativeSyntheticEvent<{}>) => {
    setIsFocused(true);
  }, []);

  const onBlur = useCallback((e: NativeSyntheticEvent<{}>) => {
    setIsFocused(false);
  }, []);

  return { isFocused, onFocus, onBlur };
}
