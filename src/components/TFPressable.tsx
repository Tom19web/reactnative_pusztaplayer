import { forwardRef } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp, View } from 'react-native';
import { useTVFocus } from '../hooks/useTVFocus';

interface TFPressableProps extends PressableProps {
  hasTVPreferredFocus?: boolean;
  focusedStyle?: StyleProp<ViewStyle>;
}

/**
 * Pressable with built-in TV focus tracking.
 * Standard RN doesn't expose `focused` in the style callback,
 * so this component uses onFocus/onBlur + useState.
 *
 * Usage:
 *   <TFPressable
 *     onPress={handlePress}
 *     focusedStyle={{ borderColor: 'yellow', borderWidth: 2 }}
 *     style={styles.myButton}
 *   >
 *     <Text>Click me</Text>
 *   </TFPressable>
 */
const TFPressable = forwardRef<View, TFPressableProps>(function TFPressable({
  hasTVPreferredFocus,
  focusedStyle,
  style,
  onPress,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  children,
  ...rest
}: TFPressableProps, ref) {
  const { isFocused, onFocus, onBlur } = useTVFocus();

  const combinedStyle = [style, isFocused && focusedStyle].filter(Boolean) as StyleProp<ViewStyle>;

  const tvProps = hasTVPreferredFocus ? { hasTVPreferredFocus: true as const } : {};

  return (
    <Pressable
      ref={ref}
      style={combinedStyle}
      onPress={onPress}
      onFocus={(e) => { onFocus(e); onFocusProp?.(e); }}
      onBlur={(e) => { onBlur(e); onBlurProp?.(e); }}
      {...tvProps}
      {...rest}
    >
      {children}
    </Pressable>
  );
});

export default TFPressable;
