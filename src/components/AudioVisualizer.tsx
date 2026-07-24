import React, { useMemo, useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

const BAR_W = 6;
const BAR_GAP = 3;
const MAX_H = 80;

interface Props {
  animValues: Animated.Value[];
  active: boolean;
}

function Bar({ anim, x, index }: { anim: Animated.Value; x: number; index: number }) {
  const [height, setHeight] = useState(2);

  useEffect(() => {
    const id = anim.addListener(({ value }) => {
      setHeight(Math.max(2, Math.round(value * MAX_H)));
    });
    return () => anim.removeListener(id);
  }, [anim]);

  const colors = ['#ffcc00', '#ffcc00', '#ffcc00', '#ffcc00', '#00FFFF', '#00FFFF', '#00FFFF', '#00FFFF', '#39FF14', '#39FF14', '#39FF14', '#39FF14', '#39FF14', '#39FF14', '#39FF14', '#39FF14'];

  return (
    <Rect
      x={x}
      y={MAX_H - height}
      width={BAR_W}
      height={height}
      fill={colors[index]}
      rx={1}
    />
  );
}

export default function AudioVisualizer({ animValues, active }: Props) {
  if (!active) return null;

  const bars = animValues.map((anim, i) => (
    <Bar key={i} anim={anim} x={i * (BAR_W + BAR_GAP)} index={i} />
  ));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={16 * (BAR_W + BAR_GAP) - BAR_GAP} height={MAX_H}>
        {bars}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
