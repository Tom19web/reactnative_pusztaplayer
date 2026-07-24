import { View, Text, Image, StyleSheet } from 'react-native';
import FastImage from 'react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import TFPressable from './TFPressable';
import RuggedBorder from './RuggedBorder';
import { COLORS, FONT } from '../constants';
import { RadioStation } from '../constants/radioStations';

const CARD_W = 100;
const CARD_H = 80;

interface Props {
  station: RadioStation;
  onPress: () => void;
}

export default function RadioCard({ station, onPress }: Props) {
  return (
    <RuggedBorder color={COLORS.cyan} width={CARD_W} height={CARD_H} wobbleFactor={0.4}>
      <View style={{ overflow: 'hidden' }}>
        <TFPressable
          style={styles.card}
          focusedStyle={styles.cardFocused}
          onPress={onPress}
        >
          <LinearGradient
            colors={['#1a2228', '#101820', '#080810']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />
          <View style={styles.logoWrap}>
            {station.logo ? (
              <FastImage source={{ uri: station.logo, priority: FastImage.priority.normal }} style={styles.logo} resizeMode={FastImage.resizeMode.contain} />
            ) : (
              <Text style={styles.fallback}>{'\uD83D\uDCFB'}</Text>
            )}
          </View>
          <View style={styles.nameWrap}>
            <Text style={styles.name} numberOfLines={1}>{station.name}</Text>
          </View>
        </TFPressable>
      </View>
    </RuggedBorder>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 0,
    overflow: 'hidden',
  },
  cardFocused: { transform: [{ scale: 1.04 }], backgroundColor: 'rgba(255,204,0,0.15)' },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  logoWrap: {
    height: Math.round(CARD_H * 0.7),
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  logo: { width: '90%', height: '90%' },
  fallback: { fontSize: 24 },
  nameWrap: {
    height: Math.round(CARD_H * 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  name: {
    color: COLORS.text,
    fontSize: FONT.xs - 2,
    textAlign: 'center',
    fontFamily: '007Toontime',
  },
});
