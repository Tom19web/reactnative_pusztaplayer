import { useRef, useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, FONT } from '../constants';
import { EpgRow } from '../hooks/useEpg';

interface Props {
  rows: EpgRow[];
  timelineStart: number;
  timelineEnd: number;
  onSelectProgram: (row: EpgRow, progIdx: number) => void;
  onPlayChannel: (row: EpgRow) => void;
}

const PX_PER_MINUTE = 2.5;
const CHANNEL_ROW_H = 56;
const CHANNEL_LABEL_W = 100;
const TIME_HEADER_H = 28;

export default function EpgGrid({ rows, timelineStart, timelineEnd, onSelectProgram, onPlayChannel }: Props) {
  const [focusedRow, setFocusedRow] = useState(0);
  const [focusedCol, setFocusedCol] = useState(0);
  const vScrollRef = useRef<ScrollView>(null);
  const hScrollRef = useRef<ScrollView>(null);

  const totalMinutes = Math.max((timelineEnd - timelineStart) / 60000, 60);
  const totalWidth = totalMinutes * PX_PER_MINUTE;

  const handleKeyDown = useCallback((dir: 'up' | 'down' | 'left' | 'right') => {
    if (dir === 'up') setFocusedRow(prev => Math.max(0, prev - 1));
    else if (dir === 'down') setFocusedRow(prev => Math.min(rows.length - 1, prev + 1));
    else if (dir === 'left') setFocusedCol(prev => Math.max(0, prev - 1));
    else if (dir === 'right') {
      const row = rows[focusedRow];
      if (row) setFocusedCol(prev => Math.min((row.programs.length || 1) - 1, prev + 1));
    }
  }, [focusedRow, focusedCol, rows]);

  const now = Date.now();
  const nowX = ((now - timelineStart) / 60000) * PX_PER_MINUTE;

  return (
    <View style={styles.container}>
      {/* Time header */}
      <View style={[styles.timeHeader, { width: totalWidth + CHANNEL_LABEL_W }]}>
        <View style={{ width: CHANNEL_LABEL_W }} />
        {(() => {
          const markers: JSX.Element[] = [];
          const startHour = new Date(timelineStart);
          startHour.setMinutes(0, 0, 0);
          startHour.setHours(startHour.getHours() + 1);
          for (let t = startHour.getTime(); t <= timelineEnd; t += 30 * 60000) {
            const x = ((t - timelineStart) / 60000) * PX_PER_MINUTE;
            const d = new Date(t);
            const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            markers.push(
              <View key={t} style={[styles.timeMarker, { left: x - 20 }]}>
                <Text style={styles.timeText}>{label}</Text>
              </View>
            );
          }
          return markers;
        })()}
      </View>

      {/* Channel rows */}
      <ScrollView ref={vScrollRef} style={styles.vScroll}>
        {rows.map((row, ri) => (
          <View key={row.channel.key} style={[styles.channelRow, ri === focusedRow && styles.channelRowFocused]}>
            {/* Channel label */}
            <View style={styles.channelLabel}>
              <Text style={styles.channelLabelText} numberOfLines={1}>{row.channel.title}</Text>
            </View>

            {/* Programs */}
            <ScrollView ref={hScrollRef} horizontal style={styles.hScroll} showsHorizontalScrollIndicator={false}>
              <View style={[styles.programsRow, { width: totalWidth }]}>
                {row.programs.map((p, pi) => {
                  const left = ((p.startTimestamp - timelineStart) / 60000) * PX_PER_MINUTE;
                  const width = ((p.endTimestamp - p.startTimestamp) / 60000) * PX_PER_MINUTE;
                  const isFocused = ri === focusedRow && pi === focusedCol;
                  const isNow = p.startTimestamp <= now && p.endTimestamp > now;
                  return (
                    <TFPressable
                      key={p.id || pi}
                      style={[styles.programBlock, { left, width }, isNow && styles.programNow, isFocused && styles.programFocused]}
                      focusedStyle={styles.programFocused}
                      onPress={() => onSelectProgram(row, pi)}
                    >
                      <Text style={styles.programTime}>{p.startTime}</Text>
                      <Text style={[styles.programTitle, isFocused && styles.programTitleFocused]} numberOfLines={2}>{p.title}</Text>
                    </TFPressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ))}
      </ScrollView>

      {/* Now indicator */}
      {nowX > 0 && nowX < totalWidth && (
        <View style={[styles.nowLine, { left: CHANNEL_LABEL_W + nowX }]} pointerEvents="none" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  timeHeader: { height: TIME_HEADER_H, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.cyan },
  timeMarker: { position: 'absolute', top: 4 },
  timeText: { color: COLORS.muted, fontSize: 10, fontFamily: 'Poppins-Regular' },
  vScroll: { flex: 1 },
  channelRow: { height: CHANNEL_ROW_H, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(0,255,255,0.1)' },
  channelRowFocused: { backgroundColor: 'rgba(255,204,0,0.08)' },
  channelLabel: { width: CHANNEL_LABEL_W, paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center', borderRightWidth: 1, borderRightColor: 'rgba(0,255,255,0.15)' },
  channelLabelText: { color: COLORS.text, fontSize: 11, fontFamily: 'Poppins-Bold' },
  hScroll: { flex: 1 },
  programsRow: { flexDirection: 'row', height: CHANNEL_ROW_H, position: 'relative' },
  programBlock: { position: 'absolute', top: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  programNow: { borderColor: COLORS.cyan, borderWidth: 1 },
  programFocused: { backgroundColor: 'rgba(255,204,0,0.15)', borderColor: COLORS.yellow, borderWidth: 2, transform: [{ scale: 1.02 }] },
  programTime: { color: COLORS.muted, fontSize: 9, fontFamily: 'Poppins-Regular' },
  programTitle: { color: COLORS.text, fontSize: 10, fontFamily: 'Poppins-Bold', marginTop: 2 },
  programTitleFocused: { color: COLORS.yellow },
  nowLine: { position: 'absolute', top: TIME_HEADER_H, bottom: 0, width: 2, backgroundColor: COLORS.red },
});
