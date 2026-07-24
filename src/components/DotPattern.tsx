import { StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';

interface DotPatternProps {
  dotColor?: string;
  dotOpacity?: number;
  spacing?: number;
  dotRadius?: number;
}

export default function DotPattern({ dotColor = '#000', dotOpacity = 0.15, spacing = 10, dotRadius = 2 }: DotPatternProps) {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="dots" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <Circle cx={spacing / 2} cy={spacing / 2} r={dotRadius} fill={dotColor} opacity={dotOpacity} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#dots)" />
    </Svg>
  );
}
