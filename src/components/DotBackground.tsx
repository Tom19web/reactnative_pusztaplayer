import { Dimensions, StyleSheet } from 'react-native';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

export default function DotBackground() {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <Circle cx="7" cy="7" r="1" fill="white" opacity={0.07} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#dots)" />
    </Svg>
  );
}
