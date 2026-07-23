import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Defs, Pattern, Rect, Circle } from 'react-native-svg';

export default function MainBg() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#060810', '#0c0f20', '#151430']}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="mb-dots" x="0" y="0" width={10} height={10} patternUnits="userSpaceOnUse">
            <Circle cx={5} cy={5} r={2} fill="#2a2550" opacity={0.35} />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#mb-dots)" />
      </Svg>
    </View>
  );
}
