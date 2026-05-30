// Stub for react-native-linear-gradient on Windows (no native module)
import React from 'react';
import { View } from 'react-native';

export default function LinearGradient(props: any) {
  return React.createElement(View, {
    ...props,
    style: [{ overflow: 'hidden' }, props.style, props.colors && { backgroundColor: props.colors[0] }],
  }, props.children);
}
