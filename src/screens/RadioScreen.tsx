import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import RadioCard from '../components/RadioCard';
import RadioPlayer from '../components/RadioPlayer';
import Pagination from '../components/Pagination';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import DotPattern from '../components/DotPattern';
import FilterBtn from '../components/FilterBtn';
import FilterItem from '../components/FilterItem';
import ShadowWrapper from '../components/ShadowWrapper';
import { radioStations, RadioStation, USE_RADIO_API } from '../constants/radioStations';
import { COLORS, FONT, SPACING } from '../constants';
import { useCore } from '../store/AppContext';
import { getRadioPlayCounts, incrementRadioPlay, loadRadioRecents, saveRadioRecents } from '../services/radioStorage';
import { fetchRadioStations } from '../services/radioService';

interface Props {
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

const CARD_W = 100;
const CARD_H = 80;
const PAGE_SIZE = 24;
const MAX_RECENTS = 7;

const sortOptions = ['Név ↑', 'Név ↓'];

export default function RadioScreen({ onPlayContent, onBack }: Props) {
  const { state: { searchTerm } } = useCore();
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState<RadioStation | null>(null);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [recents, setRecents] = useState<RadioStation[]>([]);
  const [activeSort, setActiveSort] = useState('Név ↑');
  const [showSort, setShowSort] = useState(false);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const counts = await getRadioPlayCounts();
      setPlayCounts(counts);

      let list: RadioStation[] = [];
      if (USE_RADIO_API) {
        try {
          list = await fetchRadioStations();
        } catch {
          list = radioStations; // fallback to hardcoded
        }
      } else {
        list = radioStations;
      }
      setStations(list);
      setLoading(false);

      const recentKeys = await loadRadioRecents();
      const recentStations = recentKeys.map(k => list.find(s => s.key === k)).filter(Boolean) as RadioStation[];
      if (recentStations.length > 0) setRecents(recentStations);
    })();
  }, []);

  useEffect(() => { setPage(0); }, [searchTerm, activeSort]);

  const sorted = useMemo(() => {
    const list = [...stations];
    if (activeSort === 'Név ↑') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => b.name.localeCompare(a.name));
    }
    return list;
  }, [activeSort, stations]);

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

  const filterTop = SPACING.sm + SPACING.sm + SPACING.md + SPACING.md;

  if (playing) {
    return <RadioPlayer station={playing} onBack={handlePlayerBack} />;
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{'\u23F3'} Rádiócsatornák betöltése...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} nestedScrollEnabled>

        {/* Recents section */}
        {!searchTerm && recents.length > 0 && (
          <View style={{ marginBottom: SPACING.md }}>
            <RuggedBorder color={COLORS.cyan} wobbleFactor={0.7}>
              <View style={styles.recentsWrap}>
                <LinearGradient
                  colors={['#1a2228', '#101820', '#080810']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.recentsGradient}
                />
                <DotPattern dotColor="#fff" dotOpacity={0.05} spacing={14} />
                <Text style={styles.recentsTitle}>Legutóbb hallgatott</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentsRow}>
                  {recents.map(s => (
                    <RadioCard key={s.key} station={s} onPress={() => handlePress(s)} />
                  ))}
                </ScrollView>
              </View>
              <SoundEffect text="ON AIR!" textColor="#ffcc00" bgColor={COLORS.red} top={-10} right={-8} rotate={-6} fontSize={18} />
            </RuggedBorder>
          </View>
        )}

        {/* Filter bar */}
        <RuggedBorder color={COLORS.black} wobbleFactor={0.7} style={{ marginBottom: SPACING.md }}>
          <View style={styles.filterBox}>
            <DotPattern dotColor="#000" dotOpacity={0.15} spacing={6} dotRadius={1.5} />
            <Text style={styles.filterLabel}>Rendezés: </Text>
            <FilterBtn label={activeSort} onPress={() => setShowSort(!showSort)} />
          </View>
          <SoundEffect text="SORT!" textColor={COLORS.red} bgColor={COLORS.cyan} top={-2} right={-8} rotate={5} />
        </RuggedBorder>

        {showSort && (
          <View style={styles.filterOverlay}>
            <ShadowWrapper offset={6} borderRadius={6}>
              <ScrollView style={styles.filterOverlayScroll} nestedScrollEnabled>
                {sortOptions.map(opt => (
                  <FilterItem
                    key={opt}
                    label={opt}
                    isActive={opt === activeSort}
                    onPress={() => { setActiveSort(opt); setShowSort(false); }}
                  />
                ))}
              </ScrollView>
            </ShadowWrapper>
          </View>
        )}

        {/* Radio grid */}
        {pageItems.length === 0 ? (
          <View style={styles.empty}><Text style={styles.emptyText}>Nincs találat.</Text></View>
        ) : (
          <View style={styles.gridWrap}>
            {pageItems.map(s => (
              <RadioCard key={s.key} station={s} onPress={() => handlePress(s)} />
            ))}
            {Array.from({ length: PAGE_SIZE - pageItems.length }).map((_, i) => (
              <View key={`e-${i}`} style={{ width: CARD_W, height: CARD_H }} />
            ))}
          </View>
        )}

        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} pageNumbers={pageNumbers} onPageChange={setPage} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: 40 },
  // Recents
  recentsWrap: {
    position: 'relative',
    padding: SPACING.sm,
    overflow: 'hidden',
  },
  recentsGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  recentsTitle: { color: COLORS.yellow, fontSize: FONT.md, fontFamily: 'Bangers-Regular', marginBottom: SPACING.xs, letterSpacing: 1 },
  recentsRow: { flexDirection: 'row', gap: SPACING.sm },
  // Filter
  filterBox: {
    position: 'relative',
    backgroundColor: '#ffcc00',
    borderRadius: 0,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    overflow: 'hidden',
  },
  filterLabel: { color: COLORS.black, fontFamily: 'Bangers-Regular', fontSize: 14 },
  filterOverlay: {
    position: 'absolute',
    top: SPACING.lg + 40,
    left: SPACING.md,
    zIndex: 999,
    elevation: 20,
  },
  filterOverlayScroll: {
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: SPACING.xs,
    maxHeight: 160,
    minWidth: 160,
  },
  // Grid
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: COLORS.muted, fontSize: FONT.md },
});
