import { useState, useMemo, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface RuggedLineProps {
  direction: 'horizontal' | 'vertical';
  color: string;
  strokeWidth?: number;
}

function buildWavyPath(length: number, seed: number, amp: number, isVertical: boolean): string {
  const numPoints = Math.max(30, Math.round(length / 2.5));
  const phase1 = seed * 7.3;
  const phase2 = seed * 13.7;
  const freq1 = 6;
  const freq2 = 2.5;

  let d = '';
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const pos = t * length;
    const wb =
      (Math.sin(2 * Math.PI * freq1 * t + phase1) * 0.65 +
       Math.sin(2 * Math.PI * freq2 * t + phase2) * 0.35) * amp;
    const px = isVertical ? wb : pos;
    const py = isVertical ? pos : wb;
    d += i === 0 ? `M${px.toFixed(2)},${py.toFixed(2)} ` : `L${px.toFixed(2)},${py.toFixed(2)} `;
  }
  return d;
}

export default function RuggedLine({ direction, color, strokeWidth = 2.5 }: RuggedLineProps) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const seed = useRef(Math.random() * 1000).current;

  const isVertical = direction === 'vertical';
  const pathD = useMemo(() => {
    const length = isVertical ? dims.h : dims.w;
    if (length < 10) return '';
    const amp = Math.min(dims.w, dims.h) * 0.03 || 4;
    return buildWavyPath(length, seed, amp, isVertical);
  }, [dims.w, dims.h, seed, direction]);

  return (
    <View
      style={[s.wrap, isVertical ? s.vertical : s.horizontal]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) setDims({ w: width, h: height });
      }}
    >
      {pathD !== '' && (
        <Svg
          width={dims.w + 4}
          height={dims.h + 4}
          viewBox={`-2 -2 ${dims.w + 4} ${dims.h + 4}`}
          style={s.svg}
        >
          <Path
            d={pathD}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </Svg>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'visible' },
  horizontal: { width: '100%', height: 10, flexShrink: 0 },
  vertical: { width: 10, height: '100%', flexShrink: 0 },
  svg: { position: 'absolute', top: 0, left: 0 },
});
