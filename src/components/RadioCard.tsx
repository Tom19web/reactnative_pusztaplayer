import { View, Text, Image, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, FONT } from '../constants';
import { RadioStation } from '../constants/radioStations';

interface Props {
  station: RadioStation;
  onPress: () => void;
}

export default function RadioCard({ station, onPress }: Props) {
  return (
    <TFPressable
      style={styles.card}
      focusedStyle={styles.cardFocused}
      onPress={onPress}
    >
      <View style={styles.logoWrap}>
        <Image source={{ uri: station.logo }} style={styles.logo} resizeMode="contain" />
      </View>
      <Text style={styles.name} numberOfLines={1}>{station.name}</Text>
      <View style={styles.liveRow}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>ÉLŐ</Text>
      </View>
    </TFPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 150, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 14, gap: 8,
  },
  cardFocused: {
    backgroundColor: 'rgba(255,204,0,0.12)',
    borderColor: COLORS.yellow,
    transform: [{ scale: 1.04 }],
  },
  logoWrap: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: COLORS.panel,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  logo: { width: 56, height: 56 },
  name: {
    color: COLORS.text, fontSize: 11, fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  liveDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: COLORS.red,
  },
  liveText: {
    color: COLORS.red, fontSize: 9, fontFamily: 'Poppins-Bold', letterSpacing: 1,
  },
});
