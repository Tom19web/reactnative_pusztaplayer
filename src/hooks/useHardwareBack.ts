import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

export function useHardwareBack(onBack: () => void, deps: React.DependencyList = [], enabled = true) {
  const cbRef = useRef(onBack);
  cbRef.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      cbRef.current();
      return true;
    });
    return () => h.remove();
  }, deps);
}
