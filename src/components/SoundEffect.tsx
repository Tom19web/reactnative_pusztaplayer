import { StyleSheet, View } from 'react-native';
import ComicStarburst from './ComicStarburst';

export function starburstPoints(cx: number, cy: number, inner: number, outer: number, spikes: number): string {
  let pts = '';
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const jitter = (Math.sin(i * 7.3) * Math.cos(i * 3.7)) * 3;
    const x = cx + (r + jitter) * Math.cos(angle);
    const y = cy + (r + jitter) * Math.sin(angle);
    pts += `${x.toFixed(1)},${y.toFixed(1)} `;
  }
  return pts.trim();
}

interface SoundEffectProps {
  text: string;
  textColor: string;
  bgColor: string;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  rotate: number;
  fontSize?: number;
}

export default function SoundEffect({ text, textColor, bgColor, top, bottom, left, right, rotate, fontSize = 22 }: SoundEffectProps) {
  return (
    <View
      style={[
        s.wrap,
        {
          top,
          bottom,
          left,
          right,
          transform: [{ rotate: `${rotate}deg` }],
        },
      ]}
      pointerEvents="none"
    >
      <ComicStarburst
        size={60}
        pointsCount={12}
        fillColor={bgColor}
        borderColor="#000"
        borderWidth={1.5}
        shadowOffset={2}
        text={text}
        textColor={textColor}
        fontSize={fontSize}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 10,
  },
});
