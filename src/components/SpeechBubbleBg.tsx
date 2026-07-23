import Svg, { Path } from 'react-native-svg';
import { StyleSheet } from 'react-native';

interface SpeechBubbleBgProps {
  width: number;
  height?: number;
  tailX?: number;
  tailWidth?: number;
  tailHeight?: number;
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

export default function SpeechBubbleBg({
  width,
  height = 42,
  tailX = 24,
  tailWidth = 16,
  tailHeight = 12,
  fillColor = '#f4f0e7',
  borderColor = '#000',
  borderWidth = 3,
}: SpeechBubbleBgProps) {
  const r = 10;

  const d = `
    M ${r} 0
    H ${width - r}
    A ${r} ${r} 0 0 1 ${width} ${r}
    V ${height - r}
    A ${r} ${r} 0 0 1 ${width - r} ${height}
    H ${tailX + tailWidth}
    L ${tailX + tailWidth / 2 - 4} ${height + tailHeight}
    L ${tailX} ${height}
    H ${r}
    A ${r} ${r} 0 0 1 0 ${height - r}
    V ${r}
    A ${r} ${r} 0 0 1 ${r} 0
    Z
  `;

  return (
    <Svg
      width={width}
      height={height + tailHeight}
      style={s.svg}
    >
      <Path
        d={d}
        fill={fillColor}
        stroke={borderColor}
        strokeWidth={borderWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const s = StyleSheet.create({
  svg: { position: 'absolute', top: 0, left: 0 },
});
