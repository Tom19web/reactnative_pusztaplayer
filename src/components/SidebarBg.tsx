import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Pattern, Rect, Circle, Polygon, G } from 'react-native-svg';
import { comicStarburstPoints } from './ComicStarburst';

const CW = 220;

export const STARS: { top: number; left?: number; right?: number; size: number; fill: string }[] = [
  { top: 30, left: 8, size: 30, fill: '#39FF14' },
  { top: 120, right: 60, size: 26, fill: '#FF6600' },
  { top: 210, left: 20, size: 23, fill: '#FFEE00' },
  { top: 290, right: 25, size: 27, fill: '#FF0044' },
  { top: 360, right: 54, size: 26, fill: '#FF6600' },
  { top: 380, left: 6, size: 32, fill: '#39FF14' },
  { top: 540, left: 16, size: 23, fill: '#FFEE00' },
  { top: 620, right: 8, size: 30, fill: '#FF0044' },
];

export function useStarData() {
  return useMemo(() => STARS.map(s => {
    const x = s.left !== undefined ? s.left : CW - (s.right || 0) - s.size;
    return { x, y: s.top, pts: comicStarburstPoints(s.size, 5, 2, 2), fill: s.fill };
  }), []);
}

export function SidebarStars() {
  const starData = useStarData();
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {starData.map((s, i) => (
        <G key={i} transform={`translate(${s.x}, ${s.y})`}>
          <G transform="translate(2, 2)">
            <Polygon points={s.pts} fill="#000" />
          </G>
          <Polygon points={s.pts} fill={s.fill} stroke="#000" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </G>
      ))}
    </Svg>
  );
}

export default function SidebarBg() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LinearGradient
        colors={['#060810', '#0c0f20', '#151430']}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="sb-dots" x="0" y="0" width={10} height={10} patternUnits="userSpaceOnUse">
            <Circle cx={5} cy={5} r={2} fill="#2a2550" opacity={0.35} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#sb-dots)" />
      </Svg>
    </View>
  );
}
