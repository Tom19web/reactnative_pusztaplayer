// Windows-specific nav icons using Unicode/emoji (react-native-svg is stubbed)
import { Text } from 'react-native';

type IconProps = { size?: number; color?: string };

export function HomeIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return <Text style={{ fontSize: size * 0.72, color }}>{'\u{1F3E0}'}</Text>;
}

export function LiveIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return <Text style={{ fontSize: size * 0.72, color }}>{'\u{1F4FA}'}</Text>;
}

export function MoviesIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return <Text style={{ fontSize: size * 0.72, color }}>{'\u{1F3AC}'}</Text>;
}

export function SeriesIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return <Text style={{ fontSize: size * 0.72, color }}>{'\u{1F3AC}'}</Text>;
}

export function FavIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return <Text style={{ fontSize: size * 0.72, color }}>{'\u{2B50}'}</Text>;
}

export function WatchLaterIcon({ size = 24, color = '#1a1a1a' }: IconProps) {
  return <Text style={{ fontSize: size * 0.72, color }}>{'\u{23F0}'}</Text>;
}
