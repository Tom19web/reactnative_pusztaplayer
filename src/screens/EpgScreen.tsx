import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import EpgGrid from '../components/EpgGrid';
import EpgDetailPopup from '../components/EpgDetailPopup';
import Pagination from '../components/Pagination';
import { COLORS, FONT, SPACING } from '../constants';
import { useCore } from '../store/AppContext';
import { useEpg, EpgRow } from '../hooks/useEpg';

interface Props {
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

const PAGE_SIZE = 8;

export default function EpgScreen({ onPlayContent, onBack }: Props) {
  const { state: { searchTerm, playlist } } = useCore();
  const allChannels = playlist?.liveChannels || [];
  const channels = useMemo(() => {
    const baseTitle = (t: string) => t.replace(/\s+(FHD|HD|SD|4K|UHD)\s*$/i, '');
    const seen = new Set<string>();
    return allChannels.filter(ch => {
      const k = `${baseTitle(ch.title)}||${ch.group}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [allChannels]);
  const [page, setPage] = useState(0);
  const { rows, loading } = useEpg(searchTerm, channels, page, PAGE_SIZE);
  const [popup, setPopup] = useState<{ row: EpgRow; idx: number } | null>(null);

  const totalPages = Math.ceil(channels.length / PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i);
    if (page < 3) return [0, 1, 2, 3, 4];
    if (page > totalPages - 4) return Array.from({ length: 5 }, (_, i) => totalPages - 5 + i);
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  useEffect(() => {
    setPage(0);
  }, [channels.length]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (popup) { setPopup(null); return true; }
      onBack();
      return true;
    });
    return () => h.remove();
  }, [onBack, popup]);

  const handlePlay = useCallback((row: EpgRow) => {
    setPopup(null);
    onPlayContent(row.channel.key);
  }, [onPlayContent]);

  return (
    <View style={styles.container}>
      {loading && (
        <Text style={styles.progressHint}>&#x23F3; Betöltés...</Text>
      )}
      {rows.length === 0 && !loading ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nincs program a megadott időablakban{searchTerm ? ' erre: ' + searchTerm : ''}</Text>
        </View>
      ) : (
        <EpgGrid
          rows={rows}
          onSelectProgram={(row, idx) => setPopup({ row, idx })}
          onPlayChannel={(row) => handlePlay(row)}
        />
      )}
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} pageNumbers={pageNumbers} onPageChange={setPage} />
      )}
      {popup && (
        <EpgDetailPopup
          row={popup.row}
          progIdx={popup.idx}
          onPlay={() => handlePlay(popup.row)}
          onClose={() => setPopup(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.muted, fontSize: FONT.md, textAlign: 'center', paddingHorizontal: SPACING.xl },
  progressHint: { position: 'absolute', top: 4, right: 12, zIndex: 10, color: COLORS.cyan, fontSize: 10, fontFamily: 'Poppins-Regular' },
});
