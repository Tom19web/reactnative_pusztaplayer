import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Modal } from 'react-native';
import SimpleCard from '../components/SimpleCard';
import MovieDetailPanel from '../components/MovieDetailPanel';
import { searchByCast, CastSearchResult } from '../services/aiProxy';
import { loadXtreamCredentials } from '../services/storage';
import { addSeriesEpisode } from '../services/playlistService';
import { buildEpisodeUrl, xtreamGetSeriesInfo } from '../services/xtreamApi';
import { COLORS, FONT, SPACING } from '../constants';
import { useHardwareBack } from '../hooks/useHardwareBack';

interface Props {
  castName: string;
  onPlayContent: (key: string) => void;
  onBack: () => void;
  onNavigate?: (route: string, params?: any) => void;
}

export default function CastSearchScreen({ castName, onPlayContent, onBack, onNavigate }: Props) {
  const [results, setResults] = useState<CastSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMovie, setSelectedMovie] = useState<CastSearchResult | null>(null);

  useHardwareBack(onBack, [onBack]);

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
      setSelectedMovie(item);
      return;
    }
    const seriesId = item.series_id;
    if (!seriesId) return;
    const creds = await loadXtreamCredentials();
    if (!creds) return;
    try {
      const seriesInfo = await xtreamGetSeriesInfo(creds.username, creds.password, seriesId);
      const seasonKeys = Object.keys(seriesInfo?.episodes || {}).sort((a, b) => Number(a) - Number(b));
      if (seasonKeys.length === 0) return;
      const firstEp = seriesInfo.episodes[seasonKeys[0]]?.[0];
      if (!firstEp) return;
      const url = buildEpisodeUrl(creds.username, creds.password, firstEp.id, firstEp.container_extension || 'm3u8');
      const epKey = `ep_${firstEp.id}`;
      await addSeriesEpisode({ key: epKey, title: item.title, streamUrl: url, seriesId, group: '' });
      onPlayContent(epKey);
    } catch {
      onNavigate?.('episodes', { seriesId, title: item.title });
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{'\uD83C\uDFAD'} {castName}</Text>
        <Text style={styles.subtitle}>filmjei és sorozatai</Text>

        {loading ? (
          <Text style={styles.loading}>{'\u23F3'} Keresés...</Text>
        ) : results.length === 0 ? (
          <Text style={styles.empty}>Nincs találat.</Text>
        ) : (
          <View style={styles.grid}>
            {results.map(item => (
              <SimpleCard
                key={item.key}
                type={item.type === 'movie' ? 'movie' : 'series'}
                title={item.title}
                subtitle={item.year || ''}
                imageUrl={item.poster || undefined}
                onPress={() => handlePress(item)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selectedMovie} transparent animationType="fade" onRequestClose={() => setSelectedMovie(null)}>
        <MovieDetailPanel
          streamId={selectedMovie?.stream_id ?? undefined}
          title={selectedMovie?.title}
          onClose={() => setSelectedMovie(null)}
          onPlay={() => { const m = selectedMovie; setSelectedMovie(null); if (m) onPlayContent(m.key); }}
          onCastPress={(name: string) => { setSelectedMovie(null); onNavigate?.('castSearch', { castName: name }); }}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingVertical: SPACING.md, paddingHorizontal: 20, paddingBottom: 60 },
  title: { color: COLORS.yellow, fontSize: 24, fontFamily: 'Bangers-Regular', letterSpacing: 1 },
  subtitle: { color: COLORS.muted, fontSize: 12, fontFamily: 'Poppins-Regular', marginBottom: SPACING.lg },
  loading: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: SPACING.xl },
  empty: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: SPACING.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: SPACING.md },
});
