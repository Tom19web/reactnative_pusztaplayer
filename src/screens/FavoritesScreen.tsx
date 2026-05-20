import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, BackHandler, Platform, DeviceEventEmitter } from 'react-native';
import { useCore, useFavorites, useToggleFavorite, useToggleWatchLater, useWatchLater } from '../store/AppContext';
import SimpleCard from '../components/SimpleCard';
import ShadowWrapper from '../components/ShadowWrapper';
import TFPressable from '../components/TFPressable';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';

interface FavoritesScreenProps {
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

export default function FavoritesScreen({ onPlayContent, onBack }: FavoritesScreenProps) {
  const favorites = useFavorites();
  const { state: { searchTerm } } = useCore();
  const toggleWl = useToggleWatchLater();
  const wlItems = useWatchLater();
  const isWl = (key: string) => wlItems.some(w => w.key === key);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const toggleFav = useToggleFavorite();
  const [sortLive, setSortLive] = useState<'az' | 'za' | 'date'>('date');
  const [sortMedia, setSortMedia] = useState<'az' | 'za' | 'date'>('date');

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => h.remove();
  }, [onBack]);

  // TV: menu key unfavorites the focused item
  useEffect(() => {
    if (!Platform.isTV) return;
    const sub = DeviceEventEmitter.addListener('onHWKeyEvent', (ev: { eventType: string; eventKeyAction: number }) => {
      if (ev.eventType === 'menu' && ev.eventKeyAction === 0 && focusedKey) {
        const item = favorites.find(f => f.key === focusedKey);
        if (item) toggleFav(item);
      }
    });
    return () => sub.remove();
  }, [focusedKey, favorites, toggleFav]);

  const filteredFavorites = useMemo(() => {
    if (!searchTerm) return favorites;
    return favorites.filter(f => f.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [favorites, searchTerm]);

  const sortFav = (list: typeof favorites, mode: typeof sortLive) => {
    if (mode === 'date') return list;
    return [...list].sort((a, b) => mode === 'az' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
  };

  const liveFavorites = sortFav(filteredFavorites.filter(f => f.type === 'live'), sortLive);
  const mediaFavorites = sortFav(filteredFavorites.filter(f => f.type !== 'live'), sortMedia);

  if (favorites.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>{'\u2B50'}</Text>
        <Text style={styles.emptyTitle}>Még nincsenek kedvenceid.</Text>
        <Text style={styles.emptySub}>Böngéssz a Live TV, Filmek vagy Sorozatok között, és add hozzá a kedvencekhez a tartalmakat.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} nestedScrollEnabled>
      {liveFavorites.length > 0 && (
        <View style={styles.section}>
          <ShadowWrapper offset={2} borderRadius={4}>
            <View style={styles.yellowHeader}>
              <Text style={styles.yellowHeaderText}>{'\uD83D\uDCFA'} Live TV ({liveFavorites.length})</Text>
              <TFPressable style={styles.sortBtn} focusedStyle={styles.sortBtnFocused} onPress={() => setSortLive(s => s === 'az' ? 'za' : s === 'za' ? 'date' : 'az')} accessibilityLabel="Rendezés" accessibilityRole="button">
                <Text style={styles.sortBtnText}>{sortLive === 'az' ? 'A-Z' : sortLive === 'za' ? 'Z-A' : '📅'}</Text>
              </TFPressable>
            </View>
          </ShadowWrapper>
          <View style={styles.grid}>
            {liveFavorites.map(item => (
              <View key={item.key} style={{ position: 'relative' }}>
                <TFPressable
                  style={styles.removeBtn}
                  focusedStyle={styles.removeBtnFocus}
                  onPress={() => toggleFav(item)}
                  {...(Platform.isTV ? { focusable: false } : {})}
                  accessibilityLabel={`${item.title} eltávolítása a kedvencekből`}
                  accessibilityRole="button"
                >
                  <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
                </TFPressable>
                <SimpleCard
                  type="live"
                  title={item.title}
                  subtitle={item.group || ''}
                  imageUrl={item.logo}
                  onPress={() => onPlayContent(item.key)}
                  onFocus={() => setFocusedKey(item.key)}
                  onBlur={() => setFocusedKey(prev => prev === item.key ? null : prev)}
                  onWatchLater={() => toggleWl({ key: item.key, title: item.title, type: 'live', group: item.group || '', logo: item.logo || '' })}
                  isWatchLater={isWl(item.key)}
                />
              </View>
            ))}
          </View>
        </View>
      )}

      {mediaFavorites.length > 0 && (
        <View style={styles.section}>
          <ShadowWrapper offset={2} borderRadius={4}>
            <View style={styles.yellowHeader}>
              <Text style={styles.yellowHeaderText}>{'\uD83C\uDFAC'} Film & Sorozat ({mediaFavorites.length})</Text>
              <TFPressable style={styles.sortBtn} focusedStyle={styles.sortBtnFocused} onPress={() => setSortMedia(s => s === 'az' ? 'za' : s === 'za' ? 'date' : 'az')} accessibilityLabel="Rendezés" accessibilityRole="button">
                <Text style={styles.sortBtnText}>{sortMedia === 'az' ? 'A-Z' : sortMedia === 'za' ? 'Z-A' : '📅'}</Text>
              </TFPressable>
            </View>
          </ShadowWrapper>
          <View style={styles.grid}>
            {mediaFavorites.map(item => {
              const type = item.type === 'series' ? 'series' as const : 'movie' as const;
              return (
                <View key={item.key} style={{ position: 'relative' }}>
                  <TFPressable
                    style={styles.removeBtn}
                    focusedStyle={styles.removeBtnFocus}
                    onPress={() => toggleFav(item)}
                    {...(Platform.isTV ? { focusable: false } : {})}
                  >
                    <Text style={styles.removeBtnText}>{'\u00D7'}</Text>
                  </TFPressable>
                  <SimpleCard
                    type={type}
                    title={item.title}
                    subtitle={item.group || ''}
                    imageUrl={item.logo}
                    onPress={() => onPlayContent(item.key)}
                    onFocus={() => setFocusedKey(item.key)}
                    onBlur={() => setFocusedKey(prev => prev === item.key ? null : prev)}
                    onWatchLater={() => toggleWl({ key: item.key, title: item.title, type: item.type, group: item.group || '', logo: item.logo || '' })}
                    isWatchLater={isWl(item.key)}
                  />
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.md },
  section: { marginBottom: SPACING.md },
  yellowHeader: {
    backgroundColor: COLORS.yellow,
    borderRadius: 4,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sortBtn: { backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  sortBtnFocused: { backgroundColor: COLORS.cyan },
  sortBtnText: { color: COLORS.black, fontSize: 11, fontWeight: '700', fontFamily: FONT_FAMILY_POPPINS_BOLD },
  yellowHeaderText: {
    color: COLORS.black,
    fontFamily: FONT_FAMILY_BANGERS,
    fontSize: 18,
    letterSpacing: 0.5,
    textAlign: 'left',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl,
  },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.md },
  emptyTitle: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '600', marginBottom: SPACING.sm },
  emptySub: { color: COLORS.muted, fontSize: FONT.md, textAlign: 'center', lineHeight: 28 },
  removeBtn: {
    position: 'absolute', top: 2, right: 2, zIndex: 10, elevation: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center',
  },
  removeBtnFocus: { backgroundColor: COLORS.cyan, transform: [{ scale: 1.15 }] },
  removeBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700', lineHeight: 18 },
});
