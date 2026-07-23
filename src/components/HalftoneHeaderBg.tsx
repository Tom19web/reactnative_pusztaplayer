import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Pattern, Rect, Circle, Line } from 'react-native-svg';

interface HalftoneHeaderBgProps {
  dotRadius?: number;
  spacing?: number;
}

export default function HalftoneHeaderBg({
  dotRadius = 3,
  spacing = 10,
}: HalftoneHeaderBgProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LinearGradient
        colors={['#003d55', '#007799', '#00b7eb']}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="halftoneDots" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
            <Circle cx={spacing / 2} cy={spacing / 2} r={dotRadius} fill="#005d88" opacity={0.45} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#halftoneDots)" />
        <Line x1="0" y1="100%" x2="100%" y2="100%" stroke="#000000" strokeWidth="6" />
      </Svg>
    </View>
  );
}
