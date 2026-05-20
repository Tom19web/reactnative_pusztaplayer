// Windows-specific player control icons using Unicode/emoji (react-native-svg is stubbed)
import { Text } from 'react-native';

interface IconProps { size?: number; color?: string }

const iconStyle = (size: number, color: string) => ({
  fontSize: size * 0.85,
  color,
  textAlign: 'center' as const,
});

export const PlayIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u25B6'}</Text>;

export const PauseIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u23F8'}</Text>;

export const RewindIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u23EA'}</Text>;

export const ForwardIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u23E9'}</Text>;

export const PrevIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u23EE'}</Text>;

export const NextIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u23ED'}</Text>;

export const RestartIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u21BA'}</Text>;

export const TimerIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u23F1'}</Text>;

export const HeartIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u2764'}</Text>;

export const HeartOutlineIcon = ({ size = 24, color = '#000' }: IconProps) =>
  <Text style={iconStyle(size, color)}>{'\u2661'}</Text>;
