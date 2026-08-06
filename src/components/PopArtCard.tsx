import { ReactNode, useRef } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';
import ShadowWrapper from './ShadowWrapper';
import { COLORS } from '../constants';

let _dotIdCounter = 0;

interface PopArtCardProps {
  children: ReactNode;
  style?: ViewStyle;
  contentStyle?: ViewStyle | (ViewStyle | false)[];
  shadowOffset?: number;
  borderRadius?: number;
  borderWidth?: number;
  focused?: boolean;
}

export default function PopArtCard({ children, style, contentStyle, shadowOffset = 10, borderRadius = 22, borderWidth = 4, focused }: PopArtCardProps) {
  const dotId = useRef(`pp-dot-${++_dotIdCounter}`).current;
  return (
    <ShadowWrapper offset={shadowOffset} borderRadius={borderRadius} style={style}>
      <View style={[s.card, { borderRadius, borderWidth, borderColor: focused ? COLORS.yellow : '#000' }, contentStyle]}>
        <View style={[s.dots, { borderRadius: borderRadius - borderWidth }]} pointerEvents="none">
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 14 14" preserveAspectRatio="xMidYMid slice">
            <Defs>
              <Pattern id={dotId} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
                <Circle cx="7" cy="7" r="1" fill="white" opacity={0.04} />
              </Pattern>
            </Defs>
            <Rect x="0" y="0" width="14" height="14" fill={`url(#${dotId})`} />
          </Svg>
        </View>
        {children}
      </View>
    </ShadowWrapper>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#141414', overflow: 'hidden' },
  dots: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.5 },
});
