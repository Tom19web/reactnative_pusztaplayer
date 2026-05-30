// Stub for react-native-svg on Windows (no native implementation)
// Provides empty View-based components to prevent crashes.
import React from 'react';
import { View } from 'react-native';

const stubStyle = { overflow: 'hidden' as const };

export const SvgXml = () => React.createElement(View, { style: stubStyle });
export const SvgUri = () => React.createElement(View, { style: stubStyle });
export const Svg = () => React.createElement(View, { style: stubStyle });
export const Circle = () => React.createElement(View);
export const ClipPath = () => React.createElement(View);
export const Defs = () => React.createElement(View);
export const Ellipse = () => React.createElement(View);
export const G = () => React.createElement(View);
export const Image = () => React.createElement(View);
export const Line = () => React.createElement(View);
export const LinearGradient = () => React.createElement(View);
export const Marker = () => React.createElement(View);
export const Mask = () => React.createElement(View);
export const Path = () => React.createElement(View);
export const Pattern = () => React.createElement(View);
export const Polygon = () => React.createElement(View);
export const Polyline = () => React.createElement(View);
export const RadialGradient = () => React.createElement(View);
export const Rect = () => React.createElement(View);
export const Stop = () => React.createElement(View);
export const Symbol = () => React.createElement(View);
export const TSpan = () => React.createElement(View);
export const Text = () => React.createElement(View);
export const TextPath = () => React.createElement(View);
export const Use = () => React.createElement(View);
export const parse = () => ({});

export default Svg;
