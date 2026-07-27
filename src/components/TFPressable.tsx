import { forwardRef, useRef } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp, View, Animated, NativeSyntheticEvent, TargetedEvent } from 'react-native';
import { useTVFocus } from '../hooks/useTVFocus';

interface TFPressableProps extends PressableProps {
  hasTVPreferredFocus?: boolean;
  focusedStyle?: StyleProp<ViewStyle>;
  scaleFactor?: number;
}

const TFPressable = forwardRef<View, TFPressableProps>(function TFPressable({
  hasTVPreferredFocus,
  focusedStyle,
  style,
  onPress,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  children,
  scaleFactor = 1.03,
  ...rest
}: TFPressableProps, ref) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  const animScale = useRef(new Animated.Value(1)).current;

  const handleFocus = (e: NativeSyntheticEvent<TargetedEvent>) => {
    Animated.spring(animScale, { toValue: scaleFactor, speed: 20, bounciness: 4, useNativeDriver: true }).start();
    onFocus(e);
    onFocusProp?.(e);
  };

  const handleBlur = (e: NativeSyntheticEvent<TargetedEvent>) => {
    Animated.spring(animScale, { toValue: 1.0, speed: 20, bounciness: 4, useNativeDriver: true }).start();
    onBlur(e);
    onBlurProp?.(e);
  };

  const combinedStyle = [style, isFocused && focusedStyle].filter(Boolean) as StyleProp<ViewStyle>;
  const tvProps = hasTVPreferredFocus ? { hasTVPreferredFocus: true as const } : {};

  return (
    <Animated.View style={{ transform: [{ scale: animScale }] }}>
      <Pressable
        ref={ref}
        style={combinedStyle}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...tvProps}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
});

export default TFPressable;
