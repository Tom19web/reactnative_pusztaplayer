import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, BackHandler } from 'react-native';
import EpgGrid from '../components/EpgGrid';
import EpgDetailPopup from '../components/EpgDetailPopup';
import { COLORS, FONT, SPACING } from '../constants';
import { useCore } from '../store/AppContext';
import { useEpg, EpgRow } from '../hooks/useEpg';

interface Props {
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

export default function EpgScreen({ onPlayContent, onBack }: Props) {
  const { state: { searchTerm } } = useCore();
  const { rows, loading, error } = useEpg(searchTerm);
  const [popup, setPopup] = useState<{ row: EpgRow; idx: number } | null>(null);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>⏳ TV műsor betöltése...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Nincs program a megadott időablakban{searchTerm ? ' erre: ' + searchTerm : ''}</Text>
        </View>
      ) : (
        <EpgGrid
          rows={rows}
          timelineStart={rows.reduce((min, r) => {
            const t = r.programs[0]?.startTimestamp;
            return t && t < min ? t : min;
          }, Date.now())}
          timelineEnd={rows.reduce((max, r) => {
            const t = r.programs[r.programs.length - 1]?.endTimestamp;
            return t && t > max ? t : max;
          }, Date.now() + 3600000)}
          onSelectProgram={(row, idx) => setPopup({ row, idx })}
          onPlayChannel={(row) => handlePlay(row)}
        />
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
  loadingText: { color: COLORS.muted, fontSize: FONT.lg },
  errorText: { color: COLORS.red, fontSize: FONT.lg },
  emptyText: { color: COLORS.muted, fontSize: FONT.md, textAlign: 'center', paddingHorizontal: SPACING.xl },
});
