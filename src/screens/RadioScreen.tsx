import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import RadioCard from '../components/RadioCard';
import RadioPlayer from '../components/RadioPlayer';
import Pagination from '../components/Pagination';
import { radioStations, RadioStation } from '../constants/radioStations';
import { COLORS, FONT, SPACING } from '../constants';
import { useCore } from '../store/AppContext';
import { getRadioPlayCounts, incrementRadioPlay, loadRadioRecents, saveRadioRecents } from '../services/radioStorage';

interface Props {
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

const PAGE_SIZE = 15;
const MAX_RECENTS = 5;

export default function RadioScreen({ onPlayContent, onBack }: Props) {
  const { state: { searchTerm } } = useCore();
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState<RadioStation | null>(null);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [recents, setRecents] = useState<RadioStation[]>([]);

  // Load play counts + recents from storage
  useEffect(() => {
    (async () => {
      const counts = await getRadioPlayCounts();
      setPlayCounts(counts);
      const recentKeys = await loadRadioRecents();
      const recentStations = recentKeys.map(k => radioStations.find(s => s.key === k)).filter(Boolean) as RadioStation[];
      if (recentStations.length > 0) setRecents(recentStations);
    })();
  }, []);

  // Sort by popularity then alphabetically
  const sorted = useMemo(() => {
    return [...radioStations].sort((a, b) => {
      const aPop = playCounts[a.key] || 0;
      const bPop = playCounts[b.key] || 0;
      if (aPop !== bPop) return bPop - aPop; // descending
      return a.name.localeCompare(b.name);
    });
  }, [playCounts]);

  const filtered = useMemo(() => {
    if (!searchTerm) return sorted;
    const t = searchTerm.toLowerCase();
    return sorted.filter(s => s.name.toLowerCase().includes(t));
  }, [searchTerm, sorted]);

  const pageItems = useMemo(() => {
    return filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i);
    if (page < 3) return [0, 1, 2, 3, 4];
    if (page > totalPages - 4) return Array.from({ length: 5 }, (_, i) => totalPages - 5 + i);
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  useEffect(() => { setPage(0); }, [searchTerm]);

  const handlePress = useCallback(async (station: RadioStation) => {
    await incrementRadioPlay(station.key);
    setPlayCounts(prev => ({ ...prev, [station.key]: (prev[station.key] || 0) + 1 }));

    const newRecents = [station, ...recents.filter(r => r.key !== station.key)].slice(0, MAX_RECENTS);
    setRecents(newRecents);
    await saveRadioRecents(newRecents.map(r => r.key));
    setPlaying(station);
  }, [recents]);

  const handlePlayerBack = useCallback(() => {
    setPlaying(null);
  }, []);

  if (playing) {
    return <RadioPlayer station={playing} onBack={handlePlayerBack} />;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.grid}>
        <Text style={styles.header}>{'\uD83D\uDCFB'} Rádió</Text>

        {/* Recent stations */}
        {!searchTerm && recents.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Legutóbb hallgatott</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentRow}>
              {recents.map(s => (
                <RadioCard key={s.key} station={s} onPress={() => setPlaying(s)} />
              ))}
            </ScrollView>
          </>
        )}

        {pageItems.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>Nincs találat.</Text></View>
        ) : (
          <View style={styles.gridWrap}>
            {pageItems.map(s => (
              <RadioCard key={s.key} station={s} onPress={() => handlePress(s)} />
            ))}
          </View>
        )}
      </ScrollView>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} pageNumbers={pageNumbers} onPageChange={setPage} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grid: { padding: SPACING.md },
  header: { color: COLORS.yellow, fontSize: FONT.xl, fontFamily: 'Bangers-Regular', letterSpacing: 2, marginBottom: SPACING.md },
  sectionTitle: { color: COLORS.muted, fontSize: FONT.sm, fontWeight: '600', marginBottom: SPACING.xs, marginTop: SPACING.xs },
  recentRow: { marginBottom: SPACING.md },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingBottom: 20 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: COLORS.muted, fontSize: FONT.md },
});
