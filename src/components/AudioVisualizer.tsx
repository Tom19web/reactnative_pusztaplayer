import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import Svg, { Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

const BAR_W = 6;
const BAR_GAP = 3;
const BAR_COUNT = 16;
const MAX_H = 80;
const SVG_W = BAR_COUNT * (BAR_W + BAR_GAP) - BAR_GAP;

const COLORS = [
  '#ffcc00', '#ffcc00', '#ffcc00', '#ffcc00',
  '#00FFFF', '#00FFFF', '#00FFFF', '#00FFFF',
  '#39FF14', '#39FF14', '#39FF14', '#39FF14',
  '#39FF14', '#39FF14', '#39FF14', '#39FF14',
];

interface Props {
  animValues: Animated.Value[];
  active: boolean;
}

function NativeBar({ anim, x, index }: { anim: Animated.Value; x: number; index: number }) {
  const [height, setHeight] = useState(2);
  const listenerRef = useRef<string | undefined>();

  useEffect(() => {
    const id = anim.addListener(({ value }) => {
      setHeight(Math.max(3, Math.round(value * MAX_H)));
    });
    listenerRef.current = id;
    return () => { if (listenerRef.current) anim.removeListener(listenerRef.current); };
  }, [anim]);

  return (
    <Rect
      x={x} y={MAX_H - height} width={BAR_W} height={height}
      fill={COLORS[index]} rx={1}
    />
  );
}

function FallbackBar({ x, index }: { x: number; index: number }) {
  const [height, setHeight] = useState(() => 5 + Math.random() * 15);

  useEffect(() => {
    const id = setInterval(() => {
      setHeight(Math.max(4, Math.random() * MAX_H));
    }, 200 + index * 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Rect
      x={x} y={MAX_H - height} width={BAR_W} height={height}
      fill={COLORS[index]} rx={1} opacity={0.5}
    />
  );
}

export default function AudioVisualizer({ animValues, active }: Props) {
  const bars = animValues.slice(0, BAR_COUNT).map((anim, i) => {
    const x = i * (BAR_W + BAR_GAP);
    if (active) {
      return <NativeBar key={i} anim={anim} x={x} index={i} />;
    }
    return <FallbackBar key={i} x={x} index={i} />;
  });

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={SVG_W} height={MAX_H} viewBox={`0 0 ${SVG_W} ${MAX_H}`}>
        <Defs>
          <LinearGradient id="vizGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffcc00" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#00FFFF" stopOpacity="0.1" />
          </LinearGradient>
        </Defs>
        {bars}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
});
