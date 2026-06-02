import { useRef, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Image } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, FONT } from '../constants';
import { EpgRow } from '../hooks/useEpg';

interface Props {
  rows: EpgRow[];
  onSelectProgram: (row: EpgRow, progIdx: number) => void;
  onPlayChannel: (row: EpgRow) => void;
}

const CHANNEL_ROW_H = 64;
const CHANNEL_LABEL_W = 100;

export default function EpgGrid({ rows, onSelectProgram, onPlayChannel }: Props) {
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedCol, setFocusedCol] = useState(0);
  const now = Date.now();

  useEffect(() => {
    setFocusedRow(0);
    setFocusedCol(0);
  }, [rows.length]);

  if (rows.length === 0) return null;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.vScroll}>
        {rows.map((row, ri) => {
          const isPad = row.channel.streamId === -1;
          return (
          <View key={row.channel.key} style={[styles.channelRow, ri === focusedRow && styles.channelRowFocused]}>
            <View style={styles.channelLabel}>
              {isPad ? (
                <Text style={styles.channelLabelText}>—</Text>
              ) : row.channel.logo ? (
                <Image source={{ uri: row.channel.logo }} style={styles.channelLogo} resizeMode="contain" />
              ) : (
                <Text style={styles.channelLabelText} numberOfLines={1}>{row.channel.title}</Text>
              )}
            </View>
            <View style={styles.programsRow}>
              {isPad ? (
                <Text style={styles.padText}>Nincs adat</Text>
              ) : (
                row.programs.map((p, pi) => {
                  const isFocused = ri === focusedRow && pi === focusedCol;
                  const isNow = p.startTimestamp <= now && p.endTimestamp > now;
                  return (
                    <TFPressable
                      key={p.id || pi}
                      style={[styles.programBlock, isNow && styles.programNow, isFocused && styles.programFocused]}
                      focusedStyle={styles.programFocused}
                      hasTVPreferredFocus={ri === 0 && pi === 0}
                      onFocus={() => { setFocusedRow(ri); setFocusedCol(pi); }}
                      onPress={() => onSelectProgram(row, pi)}
                    >
                      <Text style={styles.programTime}>{p.startTime}</Text>
                      <Text style={[styles.programTitle, isFocused && styles.programTitleFocused]} numberOfLines={2}>{p.title}</Text>
                    </TFPressable>
                  );
                })
              )}
            </View>
          </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  vScroll: { flex: 1 },
  channelRow: {
    height: CHANNEL_ROW_H, flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,255,255,0.1)',
    overflow: 'hidden',
  },
  channelRowFocused: { backgroundColor: 'rgba(255,204,0,0.08)' },
  channelLabel: {
    width: CHANNEL_LABEL_W, paddingHorizontal: 6, paddingVertical: 2,
    justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderRightColor: 'rgba(0,255,255,0.15)',
  },
  channelLogo: { width: 70, height: 40, borderRadius: 2 },
  channelLabelText: { color: COLORS.text, fontSize: 9, fontFamily: 'Poppins-Bold', textAlign: 'center' },
  programsRow: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 4, paddingVertical: 4, gap: 4,
  },
  programBlock: {
    flex: 1, borderRadius: 6, padding: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  programNow: {
    backgroundColor: 'rgba(0,255,255,0.08)',
    borderColor: 'rgba(0,255,255,0.3)',
  },
  programFocused: {
    backgroundColor: 'rgba(255,204,0,0.15)',
    borderColor: COLORS.yellow, borderWidth: 2,
    transform: [{ scale: 1.03 }],
  },
  programTime: { color: COLORS.muted, fontSize: 7, fontFamily: 'Poppins-Regular' },
  programTitle: { color: COLORS.text, fontSize: 8, fontFamily: 'Poppins-Bold', marginTop: 2 },
  programTitleFocused: { color: COLORS.yellow },
  padText: { color: COLORS.muted, fontSize: 8, fontFamily: 'Poppins-Regular', opacity: 0.3, alignSelf: 'center' },
});
