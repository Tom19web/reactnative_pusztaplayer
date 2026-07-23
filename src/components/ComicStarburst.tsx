import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polygon, G, Text as SvgText } from 'react-native-svg';

interface ComicStarburstProps {
  size?: number;
  pointsCount?: number;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  shadowOffset?: number;
  text?: string;
  textColor?: string;
  fontSize?: number;
  children?: React.ReactNode;
}

const OUTER_JITTERS = [1.0, 0.78, 1.08, 0.82, 0.95, 1.12, 0.75, 1.05, 0.88, 1.1, 0.8, 0.98];
const INNER_JITTERS = [0.8, 1.15, 0.85, 1.05, 0.75, 1.1, 0.9, 1.2, 0.8, 1.0, 0.85, 1.1];

export function comicStarburstPoints(
  size: number,
  pointsCount: number = 12,
  borderWidth: number = 3,
  shadowOffset: number = 5,
): string {
  const cx = size / 2;
  const cy = size / 2;
  const maxOuterR = size / 2 - borderWidth - shadowOffset;
  const baseInnerR = maxOuterR * 0.45;
  const pts: string[] = [];
  const step = (Math.PI * 2) / pointsCount;

  for (let i = 0; i < pointsCount; i++) {
    const angle = i * step;
    const nextAngle = angle + step / 2;
    const rOuter = maxOuterR * OUTER_JITTERS[i % OUTER_JITTERS.length];
    pts.push(`${(cx + rOuter * Math.cos(angle)).toFixed(1)},${(cy + rOuter * Math.sin(angle)).toFixed(1)}`);
    const rInner = baseInnerR * INNER_JITTERS[i % INNER_JITTERS.length];
    pts.push(`${(cx + rInner * Math.cos(nextAngle)).toFixed(1)},${(cy + rInner * Math.sin(nextAngle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export default function ComicStarburst({
  size = 140,
  pointsCount = 12,
  fillColor = '#FF3344',
  borderColor = '#000000',
  borderWidth = 3,
  shadowOffset = 5,
  text,
  textColor,
  fontSize = 22,
  children,
}: ComicStarburstProps) {
  const points = useMemo(
    () => comicStarburstPoints(size, pointsCount, borderWidth, shadowOffset),
    [size, pointsCount, borderWidth, shadowOffset],
  );

  return (
    <View style={[s.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {shadowOffset > 0 && (
          <G transform={`translate(${shadowOffset}, ${shadowOffset})`}>
            <Polygon points={points} fill={borderColor} />
          </G>
        )}
        <Polygon
          points={points}
          fill={fillColor}
          stroke={borderColor}
          strokeWidth={borderWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {text && textColor && (
          <SvgText
            fill={textColor}
            stroke="#000"
            strokeWidth={1}
            fontSize={fontSize}
            fontWeight="100"
            fontFamily="Bangers-Regular"
            x={size / 2}
            y={size / 2 + fontSize * 0.35}
            textAnchor="middle"
          >
            {text}
          </SvgText>
        )}
      </Svg>
      {children && <View style={s.contentOverlay}>{children}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  contentOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
});
