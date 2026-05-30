import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { EpgEntry } from '../types';
import { fetchShortEpg } from '../services/epgService';
import { loadXtreamCredentials } from '../services/storage';
import { COLORS, FONT, SPACING } from '../constants';

interface EpgPanelProps {
  streamId: number | string;
  limit?: number;
}

export default function EpgPanel({ streamId, limit = 2 }: EpgPanelProps) {
  const [entries, setEntries] = useState<EpgEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const creds = await loadXtreamCredentials();
      if (!creds) return;
      const rows = await fetchShortEpg(creds, streamId, limit);
      if (!cancelled) setEntries(rows);
    })();
    return () => { cancelled = true; };
  }, [streamId]);

  if (!entries.length) {
    return <Text style={styles.empty}>Nincs EPG adat</Text>;
  }

  return (
    <View style={styles.container}>
      {/* Now playing */}
      <View style={styles.nowRow}>
        <View style={styles.redDot} />
        <Text style={styles.nowTitle} numberOfLines={1}>{entries[0].title}</Text>
        <Text style={styles.nowTime}>{entries[0].time}{entries[0].endTime ? ` â€“ ${entries[0].endTime}` : ''}</Text>
      </View>
      {/* Next */}
      {entries[1] && (
        <View style={styles.nextRow}>
          <Text style={styles.nextLabel}>KĂ¶vetkezĹ‘</Text>
          <Text style={styles.nextTitle} numberOfLines={1}>{entries[1].title}</Text>
          <Text style={styles.nextTime}>{entries[1].time}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
  },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.panel2,
    borderRadius: 6,
    padding: SPACING.sm,
  },
  redDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.red,
  },
  nowTitle: {
    color: COLORS.text,
    fontSize: FONT.sm,
    fontWeight: '600',
    flex: 1,
  },
  nowTime: {
    color: COLORS.muted,
    fontSize: FONT.xs,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: SPACING.xs,
  },
  nextLabel: {
    color: COLORS.cyan,
    fontSize: FONT.xs,
    fontWeight: '700',
  },
  nextTitle: {
    color: COLORS.text,
    fontSize: FONT.xs,
    flex: 1,
  },
  nextTime: {
    color: COLORS.muted,
    fontSize: FONT.xs,
  },
  empty: {
    color: COLORS.muted,
    fontSize: FONT.xs,
  },
});
