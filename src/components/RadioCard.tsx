import { View, Text, Image, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, FONT } from '../constants';
import { RadioStation } from '../constants/radioStations';
import { useTVFocus } from '../hooks/useTVFocus';

interface Props {
  station: RadioStation;
  onPress: () => void;
}

export default function RadioCard({ station, onPress }: Props) {
  const { isFocused, onFocus, onBlur } = useTVFocus();

  return (
    <TFPressable
      style={[styles.card, isFocused && styles.cardFocused]}
      focusedStyle={styles.cardFocused}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <View style={styles.logoWrap}>
        <Image source={{ uri: station.logo }} style={styles.logo} resizeMode="contain" />
      </View>
      <Text style={[styles.name, isFocused && styles.nameFocused]} numberOfLines={2}>{station.name}</Text>
      <Text style={styles.liveText}>{'\u25CF'} ÉLŐ</Text>
    </TFPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 130, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 12, gap: 6,
  },
  cardFocused: {
    backgroundColor: 'rgba(255,204,0,0.12)',
    borderColor: COLORS.yellow,
    transform: [{ scale: 1.03 }],
  },
  logoWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.panel,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  logo: { width: 48, height: 48 },
  name: {
    color: COLORS.text, fontSize: 11, fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  nameFocused: { color: COLORS.yellow },
  liveText: {
    color: COLORS.red, fontSize: 9, fontFamily: 'Poppins-Bold',
    letterSpacing: 1,
  },
});
