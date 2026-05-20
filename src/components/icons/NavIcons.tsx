import Svg, { Path, G, Circle, Rect } from 'react-native-svg';

type IconProps = { size?: number; color?: string };

const bg = '#f4f0e7'; // cream fill for contrast on dark sidebar

export function HomeIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M6 22 L24 6 L42 22 L40 44 L8 44 Z" fill={bg} stroke={color} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M16 44 L16 28 L32 28 L32 44" fill={bg} stroke={color} strokeWidth={3} strokeLinejoin="round" />
      <Circle cx="24" cy="34" r="2" fill={color} />
    </Svg>
  );
}

export function LiveIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M4 10 L34 10 L34 34 L28 42 L4 42 Z" fill={bg} stroke={color} strokeWidth={3} strokeLinejoin="round" />
      <Path d="M20 10 L14 2 M28 10 L34 2" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Circle cx="14" cy="2" r="2" fill={color} />
      <Circle cx="34" cy="2" r="2" fill={color} />
      <Path d="M12 18 L28 26 L12 34 Z" fill={color} />
    </Svg>
  );
}

export function MoviesIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="4" y="10" width="40" height="28" rx="4" fill={bg} stroke={color} strokeWidth={3} />
      <Path d="M12 10 L24 26 L42 20 L42 14 L32 10 Z" fill={color} />
      <Path d="M12 10 L24 26 L12 38 L4 34 L4 20 Z" fill={color} opacity={0.5} />
    </Svg>
  );
}

export function SeriesIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="4" y="4" width="24" height="16" rx="2" fill={bg} stroke={color} strokeWidth={3} />
      <Rect x="14" y="14" width="24" height="16" rx="2" fill={bg} stroke={color} strokeWidth={3} />
      <Rect x="24" y="24" width="20" height="14" rx="2" fill={bg} stroke={color} strokeWidth={3} />
      <Path d="M10 12 L16 12 M10 16 L16 16" stroke={color} strokeWidth={1.5} />
      <Path d="M20 22 L30 22 M20 26 L30 26" stroke={color} strokeWidth={1.5} />
      <Path d="M30 32 L38 32" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

export function FavIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M24 4 L30 17 L44 18 L34 29 L36 44 L24 36 L12 44 L14 29 L4 18 L18 17 Z" fill={bg} stroke={color} strokeWidth={3} strokeLinejoin="round" />
    </Svg>
  );
}

export function WatchLaterIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx="24" cy="24" r="20" fill={bg} stroke={color} strokeWidth={3} />
      <Path d="M24 12 L24 26 L34 26" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="24" cy="24" r="2" fill={color} />
    </Svg>
  );
}
