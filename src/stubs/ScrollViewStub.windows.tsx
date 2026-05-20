// ScrollView stub - replaces ScrollView with View (Fabric crash workaround)
// Also exports ScrollViewContext for FlatList/VirtualizedList compatibility
import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';

const ScrollViewContext = React.createContext('');

interface ScrollViewProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  horizontal?: boolean;
  nestedScrollEnabled?: boolean;
  [key: string]: any;
}

const ScrollView = React.forwardRef<any, ScrollViewProps>((props, ref) => {
  const { style, contentContainerStyle, ...rest } = props;
  return <View ref={ref} style={[style, contentContainerStyle]} {...rest} />;
});

// VirtualizedList/FlatList accesses ScrollView.Context
ScrollView.Context = ScrollViewContext;

export default ScrollView;
export { ScrollViewContext };
