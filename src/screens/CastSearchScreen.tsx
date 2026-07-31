import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, BackHandler, Image } from 'react-native';
import TFPressable from '../components/TFPressable';
import { searchByCast, CastSearchResult } from '../services/aiProxy';
import { loadXtreamCredentials } from '../services/storage';
import { addSeriesEpisode } from '../services/playlistService';
import { buildEpisodeUrl } from '../services/xtreamApi';
import { COLORS, FONT, SPACING } from '../constants';

interface Props {
  castName: string;
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

export default function CastSearchScreen({ castName, onPlayContent, onBack }: Props) {
  const [results, setResults] = useState<CastSearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => handler.remove();
  }, [onBack]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      const items = await searchByCast(castName, 50);
      if (!c) { setResults(items); setLoading(false); }
    })();
    return () => { c = true; };
  }, [castName]);

  const handlePress = async (item: CastSearchResult) => {
    if (item.type === 'movie') {
      onPlayContent(item.key);
    } else {
      // Series: need to construct episode URL like EpisodeScreen does
      const creds = await loadXtreamCredentials();
      if (!creds) return;
      const url = buildEpisodeUrl(creds.username, creds.password, item.series_id || 0);
      const epKey = `ep_${item.series_id}`;
      await addSeriesEpisode({ key: epKey, title: item.title, streamUrl: url, seriesId: item.series_id || 0, group: '' });
      onPlayContent(epKey);
    }
  };

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title}>{'\uD83C\uDFAD'} {castName}</Text>
        <Text style={s.subtitle}>filmjei és sorozatai</Text>

        {loading ? (
          <Text style={s.loading}>{'\u23F3'} Keresés...</Text>
        ) : results.length === 0 ? (
          <Text style={s.empty}>Nincs találat.</Text>
        ) : (
          <View style={s.grid}>
            {results.map(item => (
              <TFPressable
                key={item.key}
                style={s.card}
                focusedStyle={s.cardFocus}
                onPress={() => handlePress(item)}
                accessibilityLabel={item.title}
                accessibilityRole="button"
              >
                <View style={s.imgWrap}>
                  {item.poster ? (
                    <Image source={{ uri: item.poster }} style={s.img} resizeMode="cover" />
                  ) : (
                    <View style={[s.img, s.imgPlaceholder]}>
                      <Text style={s.imgPlaceholderText}>{item.type === 'movie' ? '\uD83C\uDFAC' : '\uD83D\uDCFA'}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.cardTitle} numberOfLines={2}>{item.title}</Text>
                <View style={s.cardTypeBadge}>
                  <Text style={s.cardTypeText}>{item.type === 'movie' ? 'FILM' : 'SOROZAT'}</Text>
                </View>
                {item.year ? <Text style={s.cardYear}>{item.year}</Text> : null}
              </TFPressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingVertical: SPACING.md, paddingHorizontal: 20, paddingBottom: 60 },
  title: { color: COLORS.yellow, fontSize: 24, fontFamily: 'Bangers-Regular', letterSpacing: 1 },
  subtitle: { color: COLORS.muted, fontSize: 12, fontFamily: 'Poppins-Regular', marginBottom: SPACING.lg },
  loading: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: SPACING.xl },
  empty: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: SPACING.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACING.md },
  card: {
    width: 150, backgroundColor: COLORS.panel, borderRadius: 8,
    borderWidth: 2, borderColor: 'transparent',
    padding: SPACING.sm, alignItems: 'center',
  },
  cardFocus: { borderColor: COLORS.yellow, transform: [{ translateY: -4 }] },
  imgWrap: { width: 120, height: 90, borderRadius: 6, overflow: 'hidden', backgroundColor: COLORS.bg, marginBottom: SPACING.xs },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  imgPlaceholderText: { fontSize: 28 },
  cardTitle: { color: COLORS.text, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  cardTypeBadge: {
    marginTop: 4, backgroundColor: 'rgba(0,255,255,0.12)',
    borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2,
  },
  cardTypeText: { color: COLORS.cyan, fontSize: 8, fontWeight: '700' },
  cardYear: { color: COLORS.muted, fontSize: 8, marginTop: 2 },
});
