import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import RadioCard from '../components/RadioCard';
import RadioPlayer from '../components/RadioPlayer';
import Pagination from '../components/Pagination';
import { radioStations, RadioStation } from '../constants/radioStations';
import { COLORS, FONT, SPACING } from '../constants';
import { useCore } from '../store/AppContext';

interface Props {
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

const PAGE_SIZE = 30;
const MAX_RECENTS = 5;
const recents: RadioStation[] = [];

export default function RadioScreen({ onPlayContent, onBack }: Props) {
  const { state: { searchTerm } } = useCore();
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState<RadioStation | null>(null);
  const [recentStations, setRecentStations] = useState<RadioStation[]>(recents);

  const filtered = useMemo(() => {
    if (!searchTerm) return radioStations;
    const t = searchTerm.toLowerCase();
    return radioStations.filter(s => s.name.toLowerCase().includes(t));
  }, [searchTerm]);

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

  const handlePress = useCallback((station: RadioStation) => {
    const idx = recents.findIndex(r => r.key === station.key);
    if (idx >= 0) recents.splice(idx, 1);
    recents.unshift(station);
    if (recents.length > MAX_RECENTS) recents.pop();
    setRecentStations([...recents]);
    setPlaying(station);
  }, []);

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
        {!searchTerm && recentStations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Legutóbb hallgatott</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentRow}>
              {recentStations.map(s => (
                <RadioCard key={s.key} station={s} onPress={() => setPlaying(s)} />
              ))}
            </ScrollView>
          </>
        )}

        {pageItems.length === 0 ? (
          <Text style={styles.empty}>Nincs találat</Text>
        ) : (
          <View style={styles.gridWrap}>
            {pageItems.map(station => (
              <RadioCard key={station.key} station={station} onPress={() => handlePress(station)} />
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
  container: { flex: 1, backgroundColor: COLORS.bg },
  grid: { paddingVertical: SPACING.md, paddingHorizontal: 20 },
  header: {
    color: COLORS.yellow, fontSize: FONT.xl, fontFamily: 'Bangers-Regular',
    marginBottom: SPACING.sm, letterSpacing: 1,
  },
  sectionTitle: {
    color: COLORS.cyan, fontSize: FONT.sm, fontFamily: 'Poppins-Bold',
    marginBottom: SPACING.sm, letterSpacing: 1,
  },
  recentRow: {
    marginBottom: SPACING.md,
  },
  gridWrap: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  empty: { color: COLORS.muted, fontSize: FONT.md, textAlign: 'center', marginTop: SPACING.xl },
});
