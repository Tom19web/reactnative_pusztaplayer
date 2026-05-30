import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Channel, EpgEntry } from '../types';
import { fetchShortEpg } from '../services/epgService';
import { loadXtreamCredentials } from '../services/storage';
import { COLORS, FONT, SPACING } from '../constants';

interface ChannelPopupProps {
  channel: Channel;
}

export default function ChannelPopup({ channel }: ChannelPopupProps) {
  const [entries, setEntries] = useState<EpgEntry[]>([]);

  useEffect(() => {
    let c = false;
    (async () => {
      const creds = await loadXtreamCredentials();
      if (!creds) return;
      const rows = await fetchShortEpg(creds, channel.streamId, 2);
      if (!c) setEntries(rows);
    })();
    return () => { c = true; };
  }, [channel.streamId]);

  return (
    <View style={styles.container} testID="channel-popup">
      {/* Channel title */}
      <View style={styles.titleBox}>
        <Text style={styles.titleText} numberOfLines={2}>{channel.title}</Text>
      </View>

      {/* 2-column grid */}
      <View style={styles.grid}>
        <View style={styles.leftCol}>
          <View style={styles.row}><Text style={styles.label}>Státusz</Text><Text style={styles.value}>Live TV</Text></View>
          <View style={styles.row}><Text style={styles.label}>Kategória</Text><Text style={styles.value} numberOfLines={1}>{channel.group}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Minőség</Text><Text style={styles.value}>HLS</Text></View>
        </View>
        <View style={styles.rightCol}>
          {channel.logo ? (
            <Image source={{ uri: channel.logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Text style={styles.logoFallback}>📺</Text>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* EPG */}
      {entries.length > 0 ? (
        <View style={styles.epgSection}>
          <View style={styles.nowBlock}>
            <Text style={styles.nowLabel}>Most megy:</Text>
            <Text style={styles.nowTitle}>{entries[0].title}</Text>
            <Text style={styles.nowTime}>{entries[0].time}{entries[0].endTime ? ` – ${entries[0].endTime}` : ''}</Text>
            {entries[0].description ? <Text style={styles.nowDesc} numberOfLines={3}>{entries[0].description}</Text> : null}
          </View>
          {entries[1] && (
            <View style={styles.nextRow}>
              <Text style={styles.nextTime}>{entries[1].time}{entries[1].endTime ? ` – ${entries[1].endTime}` : ''}</Text>
              <Text style={styles.nextTitle} numberOfLines={1}>{entries[1].title}</Text>
            </View>
          )}
        </View>
      ) : <Text style={styles.noEpg}>Nincs EPG adat</Text>}

      <View style={styles.hintBox}>
        <Text style={styles.hintText}>A lejátszáshoz nyomd meg az OK gombot!</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 360,
    backgroundColor: COLORS.panel,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.black,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  titleBox: {
    backgroundColor: COLORS.yellow,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#000',
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs + 2,
    paddingHorizontal: SPACING.sm,
  },
  titleText: {
    color: COLORS.black,
    fontSize: FONT.lg,
    fontFamily: 'Bangers-Regular',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  grid: { flexDirection: 'row', gap: SPACING.md },
  leftCol: { flex: 1, justifyContent: 'space-between' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  label: { color: COLORS.muted, fontSize: FONT.xs + 4, minWidth: 55 },
  value: { color: COLORS.text, fontSize: FONT.xs + 4, fontWeight: '500', flex: 1, textAlign: 'right' },
  rightCol: { width: 130, height: 73, backgroundColor: COLORS.bg, borderRadius: 6, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logo: { width: '90%', height: '90%' },
  logoFallback: { fontSize: 36, color: COLORS.muted },
  divider: { height: 1, backgroundColor: COLORS.border },
  epgSection: { gap: SPACING.xs },
  nowBlock: { backgroundColor: COLORS.panel2, borderRadius: 4, padding: SPACING.sm, gap: 2 },
  nowLabel: { color: COLORS.red, fontSize: FONT.xs, fontWeight: '700' },
  nowTitle: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '600' },
  nowTime: { color: COLORS.muted, fontSize: FONT.xs },
  nowDesc: { color: COLORS.text, fontSize: FONT.xs, lineHeight: FONT.sm },
  nextRow: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.xs },
  nextTime: { color: COLORS.muted, fontSize: FONT.xs, minWidth: 80 },
  nextTitle: { color: COLORS.text, fontSize: FONT.xs, flex: 1 },
  noEpg: { color: COLORS.muted, fontSize: FONT.xs, textAlign: 'center' },
  hintBox: {
    backgroundColor: COLORS.cyan,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.black,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: SPACING.sm,
  },
  hintText: { color: COLORS.black, fontSize: FONT.xs + 4, textAlign: 'center', fontFamily: 'Poppins-Regular', fontWeight: '700' },
});
