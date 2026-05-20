import { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import TFPressable from './TFPressable';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';

const CARD_W = 120;
const LIVE_THUMB_W = CARD_W - 2;
const LIVE_THUMB_H = Math.round(LIVE_THUMB_W * 9 / 16 * 10) / 10;
const CARD_H = Math.round(LIVE_THUMB_H) + 30;

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
  const [focused, setFocused] = useState(false);

  const showProgress = progress !== undefined && progress > 0 && progress < 1;

  return (
    <View style={s.wrapper}>
      <TFPressable
        style={[isLive ? s.cardLive : s.card, { width: CARD_W }, isLive && { height: CARD_H }]} 
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
                colors={['#0d1b4a', '#4a0d5c', '#0d4a2a']}
                start={{ x: 1, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={s.thumbGrad}
              />
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={s.thumbImgLive} resizeMode="contain" />
              ) : (
                <Text style={s.thumbFallbackLive}>{'\uD83D\uDCFA'}</Text>
              )}
            </>
          ) : (
            <>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={s.thumbImg} resizeMode={isLive ? 'contain' : 'cover'} />
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
  );
}

const s = StyleSheet.create({
  wrapper: { position: 'relative' },
  // â”€â”€â”€ Non-live cards (movie/series) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  card: {
    backgroundColor: COLORS.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cyan,
    overflow: 'hidden',
  },
  cardFocused: { transform: [{ scale: 1.03 }, { translateY: -4 }], borderColor: COLORS.yellow },
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
  cornerBadgeText: { color: COLORS.black, fontSize: 9, fontWeight: '700', fontFamily: FONT_FAMILY_POPPINS_BOLD },
  meta: { paddingVertical: 0, paddingHorizontal: SPACING.xs, alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 38 },
  metaFocused: { backgroundColor: COLORS.yellow },
  metaFocusedLive: { backgroundColor: COLORS.yellow },
  title: { color: COLORS.text, fontSize: FONT.xs, fontWeight: '700', textAlign: 'center' },
  titleFocused: { color: COLORS.black },
  sub: { color: COLORS.muted, fontSize: FONT.xs - 4, textAlign: 'center' },
  subFocused: { color: COLORS.black },
  progressWrap: { height: 5, width: 120 - 16, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginTop: 1 },
  progressFill: { height: 5, backgroundColor: COLORS.yellow, borderRadius: 2, position: 'absolute', left: 0, top: 0 },
  progressText: { color: COLORS.yellow, fontSize: 7, fontWeight: '600', textAlign: 'center', lineHeight: 5 },

  // â”€â”€â”€ Live cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  cardLive: {
    backgroundColor: '#2a2a2a',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#000',
    overflow: 'hidden',
  },
  cardFocusedLive: { transform: [{ scale: 1.03 }, { translateY: -4 }], borderColor: COLORS.yellow },
  thumbLive: {
    backgroundColor: '#0d3b4a',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#000',
    overflow: 'hidden',
    width: '100%',
  },
  thumbGrad: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  thumbImgLive: { width: '95%', height: '95%', position: 'relative', zIndex: 10 },
  thumbFallbackLive: { fontSize: 40, position: 'relative', zIndex: 10 },
  // Meta (live)
  metaLive: { paddingVertical: 0, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', minHeight: 30, borderBottomLeftRadius: 7, borderBottomRightRadius: 7 },
  titleLive: { color: COLORS.text, fontSize: FONT.xs, fontWeight: '700', textAlign: 'center', lineHeight: FONT.xs, width: '100%' },
});
