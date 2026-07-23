import { ReactNode, useState, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface RuggedBorderProps {
  children: ReactNode;
  color: string;
  style?: ViewStyle;
  width?: number;
  height?: number;
  wobbleFactor?: number;
}

function buildPath(w: number, h: number, seed: number, wf: number): string {
  const cr = Math.min(w, h) * 0.06;
  const baseAmp = Math.min(w, h) * 0.018 * wf;
  const tw = w - 2 * cr;
  const th = h - 2 * cr;
  const cornerLen = (Math.PI / 2) * cr;
  const lenTop = tw;
  const lenRight = th;
  const lenBot = tw;
  const lenLeft = th;
  const total = lenTop + cornerLen + lenRight + cornerLen + lenBot + cornerLen + lenLeft + cornerLen;
  const perimeter = 2 * (w - 2 * cr) + 2 * (h - 2 * cr) + 2 * Math.PI * cr;
  const numPoints = Math.max(40, Math.round(perimeter / 4.0));

  const phase1 = seed * 7.3;
  const phase2 = seed * 13.7;

  function wobble(t: number): number {
    return (
      Math.sin(2 * Math.PI * 5 * t + phase1) * 0.7 +
      Math.sin(2 * Math.PI * 2 * t + phase2) * 0.3
    ) * baseAmp;
  }

  function normalAngle(t: number): number {
    let pos = t * total;
    if (pos < lenTop) return Math.PI / 2;
    else if (pos < lenTop + cornerLen) {
      const ct = (pos - lenTop) / cornerLen;
      return Math.PI / 2 - ct * (Math.PI / 2);
    } else if (pos < lenTop + cornerLen + lenRight) return Math.PI;
    else if (pos < lenTop + cornerLen + lenRight + cornerLen) {
      const ct = (pos - lenTop - cornerLen - lenRight) / cornerLen;
      return Math.PI - ct * (Math.PI / 2);
    } else if (pos < lenTop + cornerLen + lenRight + cornerLen + lenBot) return -Math.PI / 2;
    else if (pos < total - cornerLen) return 0;
    else {
      const ct = (pos - (total - cornerLen)) / cornerLen;
      return 0 - ct * (Math.PI / 2);
    }
  }

  function pointAt(t: number): { x: number; y: number } {
    const tTotal = t * total;
    if (tTotal < lenTop) return { x: cr + tTotal, y: 0 };
    if (tTotal < lenTop + cornerLen) {
      const a = (Math.PI / 2) * ((tTotal - lenTop) / cornerLen);
      return { x: w - cr + cr * Math.sin(a), y: cr - cr * Math.cos(a) };
    }
    if (tTotal < lenTop + cornerLen + lenRight) return { x: w, y: cr + (tTotal - lenTop - cornerLen) };
    if (tTotal < lenTop + cornerLen + lenRight + cornerLen) {
      const a = (Math.PI / 2) * ((tTotal - lenTop - cornerLen - lenRight) / cornerLen);
      return { x: w - cr + cr * Math.cos(a), y: h - cr + cr * Math.sin(a) };
    }
    if (tTotal < lenTop + cornerLen + lenRight + cornerLen + lenBot)
      return { x: w - cr - (tTotal - lenTop - cornerLen - lenRight - cornerLen), y: h };
    if (tTotal < lenTop + cornerLen + lenRight + cornerLen + lenBot + cornerLen) {
      const a = (Math.PI / 2) * ((tTotal - lenTop - cornerLen - lenRight - cornerLen - lenBot) / cornerLen);
      return { x: cr - cr * Math.sin(a), y: h - cr + cr * Math.cos(a) };
    }
    if (tTotal < total - cornerLen) return { x: 0, y: h - cr - (tTotal - lenTop - cornerLen - lenRight - cornerLen - lenBot - cornerLen) };
    const a = (Math.PI / 2) * ((tTotal - (total - cornerLen)) / cornerLen);
    return { x: cr - cr * Math.cos(a), y: cr - cr * Math.sin(a) };
  }

  let d = '';
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const { x, y } = pointAt(t);
    const n = normalAngle(t);
    const wb = wobble(t);
    d += i === 0
      ? `M${(x + Math.cos(n) * wb).toFixed(2)},${(y + Math.sin(n) * wb).toFixed(2)} `
      : `L${(x + Math.cos(n) * wb).toFixed(2)},${(y + Math.sin(n) * wb).toFixed(2)} `;
  }
  return d + 'Z';
}

export default function RuggedBorder({ children, color, style, width: staticW, height: staticH, wobbleFactor = 0.5 }: RuggedBorderProps) {
  const hasStaticDims = staticW !== undefined && staticH !== undefined;
  const [dims, setDims] = useState(hasStaticDims ? { w: staticW, h: staticH } : { w: 0, h: 0 });
  const prevDims = useRef({ w: 0, h: 0 });
  const seed = useRef(Math.random() * 1000).current;

  const pathD = useMemo(() => {
    if (dims.w < 10 || dims.h < 10) return '';
    return buildPath(dims.w, dims.h, seed, wobbleFactor);
  }, [dims.w, dims.h, seed, wobbleFactor]);

  const handleLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) {
      if (width !== prevDims.current.w || height !== prevDims.current.h) {
        prevDims.current = { w: width, h: height };
        setDims({ w: width, h: height });
      }
    }
  }, []);

  return (
    <View
      style={[s.wrap, style]}
      onLayout={hasStaticDims ? undefined : handleLayout}
    >
      {children}
      {pathD !== '' && (
        <View style={s.borderOverlay} pointerEvents="none">
          <Svg width={dims.w + 4} height={dims.h + 4} viewBox={`-2 -2 ${dims.w + 4} ${dims.h + 4}`}>
            <Path
              d={pathD}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </Svg>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'visible',
  },
  borderOverlay: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    zIndex: 1,
  },
});
