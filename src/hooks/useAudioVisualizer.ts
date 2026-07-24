import { useEffect, useRef, useState, useCallback } from 'react';
import { NativeModules, NativeEventEmitter, Platform, Animated, PermissionsAndroid } from 'react-native';

const { AudioVisualizer } = NativeModules;
let eventEmitter: NativeEventEmitter | null = null;

if (Platform.OS === 'android' && AudioVisualizer) {
  eventEmitter = new NativeEventEmitter(AudioVisualizer);
}

export function useAudioVisualizer() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const animRefs = useRef<Animated.Value[] | null>(null);

  if (!animRefs.current) {
    animRefs.current = new Array(16).fill(0).map(() => new Animated.Value(0));
  }

  const start = useCallback(async () => {
    if (!AudioVisualizer) return;
    try {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request('android.permission.RECORD_AUDIO');
      }
      await AudioVisualizer.startCapture();
      setActive(true);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to start visualizer');
    }
  }, []);

  const stop = useCallback(async () => {
    if (!AudioVisualizer) return;
    try {
      await AudioVisualizer.stopCapture();
    } catch {}
    setActive(false);
    animRefs.current?.forEach(v => v.setValue(0));
  }, []);

  useEffect(() => {
    if (!eventEmitter) return;
    const sub = eventEmitter.addListener('onAudioFftData', (data: number[]) => {
      if (!animRefs.current) return;
      const binCount = Math.min(16, data.length);
      const vals = animRefs.current;
      for (let i = 0; i < binCount; i++) {
        const norm = Math.min(1, Math.max(0, data[i] / 255));
        const smoothed = i % 2 === 0 ? norm : norm * 0.7 + 0.3 * ((vals[i] as any)._value || 0);
        (vals[i] as any).setValue(smoothed);
      }
    });

    return () => sub.remove();
  }, []);

  return { active, error, start, stop, animValues: animRefs.current };
}
