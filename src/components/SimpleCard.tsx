import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FastImage from 'react-native-fast-image';
import LinearGradient from 'react-native-linear-gradient';
import TFPressable from './TFPressable';
import RuggedBorder from './RuggedBorder';
import RuggedLine from './RuggedLine';
import { COLORS, FONT, SPACING } from '../constants';

const CARD_W = 120;
const LIVE_THUMB_W = CARD_W - 2;
const LIVE_THUMB_H = Math.round(LIVE_THUMB_W * 9 / 16 * 10) / 10;
const CARD_H = Math.round(LIVE_THUMB_H) + 28;

interface SimpleCardProps {
  type: 'live' | 'movie' | 'series';
  title: string;
  subtitle: string;
  imageUrl?: string;
  onPress: () => void;
  onLongPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  progress?: number;
  badge?: string;
  isFav?: boolean;
  onWatchLater?: () => void;
  isWatchLater?: boolean;
}

export default function SimpleCard({ type, title, subtitle, imageUrl, onPress, onLongPress, onFocus, onBlur, progress, badge, isFav, onWatchLater, isWatchLater }: SimpleCardProps) {
  const isLive = type === 'live';
  const thHeight = isLive ? LIVE_THUMB_H : Math.round(CARD_W * 3 / 2);
  const cardHeight = isLive ? CARD_H : Math.round(thHeight + 40);
  const [focused, setFocused] = useState(false);

  const showProgress = progress !== undefined && progress > 0 && progress < 1;

  return (
    <RuggedBorder color={COLORS.cyan} width={CARD_W} height={cardHeight} wobbleFactor={0.4}>
      <View style={{ overflow: 'hidden' }}>
        <TFPressable
        style={[isLive ? s.cardLive : s.card, { width: CARD_W, height: cardHeight }]} 
        focusedStyle={isLive ? s.cardFocusedLive : s.cardFocused}
        onPress={onPress}
        onLongPress={onLongPress}
        onFocus={() => { setFocused(true); onFocus?.(); }}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        testID={`card-${type}-${(title || '').slice(0, 10)}`}
        accessibilityLabel={title}
        accessibilityRole="button"
      >
        {/* â”€â”€â”€ Thumb area â”€â”€â”€ */}
        <View style={[isLive ? s.thumbLive : s.thumb, { height: thHeight }]} testID={`card-thumb-${type}`}>
          {isLive ? (
            <>
              <LinearGradient
                colors={['#181818', '#303030']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.thumbGrad}
              />
              {imageUrl ? (
                <FastImage source={{ uri: imageUrl, priority: FastImage.priority.normal }} style={s.thumbImgLive} resizeMode={FastImage.resizeMode.contain} />
              ) : (
                <Text style={s.thumbFallbackLive}>{'\uD83D\uDCFA'}</Text>
              )}
            </>
          ) : (
            <>
              {imageUrl ? (
                <FastImage source={{ uri: imageUrl, priority: FastImage.priority.normal }} style={s.thumbImg} resizeMode={FastImage.resizeMode.cover} />
              ) : (
                <Text style={s.thumbFallback}>
                  {isLive ? '\uD83D\uDCFA' : type === 'movie' ? '\uD83C\uDFAC' : '\uD83D\uDCE6'}
                </Text>
              )}
              {badge ? (
                <View style={s.cornerBadge}>
                  <Text style={s.cornerBadgeText}>{badge}</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* â”€â”€â”€ Divider line (live only) â”€â”€â”€ */}
        {isLive && <View style={{ marginTop: -10, zIndex: 1 }}><RuggedLine direction="horizontal" color="#000" strokeWidth={2} /></View>}

        {/* â”€â”€â”€ Meta area â”€â”€â”€ */}
        <View style={[isLive ? s.metaLive : s.meta, focused && (isLive ? s.metaFocusedLive : s.metaFocused)]} testID={`card-meta-${type}`}>
          <Text
            style={[isLive ? s.titleLive : s.title, focused && s.titleFocused]}
            numberOfLines={isLive ? 2 : 2}
          >
            {title}
          </Text>
          {showProgress ? (
            <View style={s.progressWrap}>
              <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              <Text style={s.progressText}>{Math.round(progress * 100)}%</Text>
            </View>
          ) : null}
        </View>
        </TFPressable>
      </View>
    </RuggedBorder>
  );
}

const s = StyleSheet.create({
  // Non-live cards (movie/series)
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 0,
    overflow: 'hidden',
  },
  cardFocused: { transform: [{ scale: 1.03 }, { translateY: -4 }] },
  thumb: {
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbFallback: { fontSize: 30 },
  cornerBadge: {
    position: 'absolute', top: 2, left: 2,
    backgroundColor: COLORS.cyan, borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  cornerBadgeText: { color: COLORS.black, fontSize: 9, fontWeight: '700', fontFamily: 'Poppins-Bold' },
  meta: { paddingVertical: 0, paddingHorizontal: SPACING.xs, alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 36 },
  metaFocused: { backgroundColor: COLORS.yellow },
  metaFocusedLive: { backgroundColor: COLORS.yellow },
  title: { color: COLORS.text, fontSize: FONT.xs - 2, textAlign: 'center', fontFamily: '007Toontime' },
  titleFocused: { color: COLORS.black },
  sub: { color: COLORS.muted, fontSize: FONT.xs - 4, textAlign: 'center' },
  subFocused: { color: COLORS.black },
  progressWrap: { height: 5, width: 120 - 16, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginTop: 1 },
  progressFill: { height: 5, backgroundColor: COLORS.cyan, borderRadius: 2, position: 'absolute', left: 0, top: 0 },
  progressText: { color: COLORS.black, fontSize: 7, fontWeight: '600', textAlign: 'center', lineHeight: 5 },

  // â”€â”€â”€ Live cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  cardLive: {
    backgroundColor: '#2a2a2a',
    borderRadius: 0,
    overflow: 'hidden',
  },
  cardFocusedLive: { transform: [{ scale: 1.03 }, { translateY: -4 }] },
  thumbLive: {
    backgroundColor: '#0d3b4a',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
    width: '100%',
  },
  thumbGrad: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  thumbImgLive: { width: '95%', height: '95%', position: 'relative', zIndex: 10 },
  thumbFallbackLive: { fontSize: 40, position: 'relative', zIndex: 10 },
  // Meta (live)
  metaLive: { paddingVertical: 0, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', minHeight: 28, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  titleLive: { color: COLORS.text, fontSize: FONT.xs - 2, textAlign: 'center', lineHeight: FONT.xs - 2, width: '100%', fontFamily: '007Toontime' },
});
