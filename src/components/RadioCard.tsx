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
    width: 112, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 10, gap: 6,
  },
  cardFocused: {
    backgroundColor: 'rgba(255,204,0,0.12)',
    borderColor: COLORS.yellow,
    transform: [{ scale: 1.04 }],
  },
  logoWrap: {
    width: 57, height: 57, borderRadius: 28,
    backgroundColor: COLORS.panel,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  logo: { width: 42, height: 42 },
  name: {
    color: COLORS.text, fontSize: 8, fontFamily: 'Poppins-Bold',
    textAlign: 'center',
  },
  liveRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  liveDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: COLORS.red,
  },
  liveText: {
    color: COLORS.red, fontSize: 7, fontFamily: 'Poppins-Bold', letterSpacing: 1,
  },
});
