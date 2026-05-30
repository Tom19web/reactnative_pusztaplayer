import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import SimpleCard from '../components/SimpleCard';
import ShadowWrapper from '../components/ShadowWrapper';
import { useWatchLater, useToggleWatchLater } from '../store/AppContext';
import { COLORS, FONT, SPACING } from '../constants';

interface WatchLaterScreenProps {
  onPlayContent: (key: string) => void;
  onBack: () => void;
}

export default function WatchLaterScreen({ onPlayContent, onBack }: WatchLaterScreenProps) {
  const wlItems = useWatchLater();
  const toggleWl = useToggleWatchLater();

  const liveList = useMemo(() => wlItems.filter(w => w.type === 'live'), [wlItems]);
  const movieList = useMemo(() => wlItems.filter(w => w.type === 'movie' || w.type === 'vod'), [wlItems]);
  const seriesList = useMemo(() => wlItems.filter(w => w.type === 'series'), [wlItems]);

  if (wlItems.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>{'\u23F0'}</Text>
        <Text style={styles.emptyTitle}>Nincs megnézendő tartalom.</Text>
        <Text style={styles.emptySub}>Egy film vagy sorozat részleteinél nyomd meg a "Megnézendő" gombot.</Text>
      </View>
    );
  }

  const renderSection = (list: any[], label: string, ico: string) => {
    if (list.length === 0) return null;
    return (
      <View style={styles.section}>
        <ShadowWrapper offset={2} borderRadius={4}>
          <View style={styles.yellowHeader}>
            <Text style={styles.yellowHeaderText}>{ico} {label} ({list.length})</Text>
          </View>
        </ShadowWrapper>
        <View style={styles.grid}>
          {list.map(item => (
            <SimpleCard
              key={item.key}
              type={item.type === 'live' ? 'live' : (item.type === 'series' ? 'series' : 'movie')}
              title={item.title}
              subtitle={item.group || ''}
              imageUrl={item.logo}
              onPress={() => onPlayContent(item.key)}
              onLongPress={() => toggleWl(item)}
              isWatchLater
            />
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} nestedScrollEnabled>
      {renderSection(liveList, 'Live TV', '\uD83D\uDCFA')}
      {renderSection(movieList, 'Filmek', '\uD83C\uDFAC')}
      {renderSection(seriesList, 'Sorozatok', '\uD83D\uDCFA')}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SPACING.md },
  section: { marginBottom: SPACING.md },
  yellowHeader: {
    backgroundColor: COLORS.yellow,
    borderRadius: 4,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
  },
  yellowHeaderText: {
    color: COLORS.black,
    fontFamily: 'Bangers-Regular',
    fontSize: 18,
    letterSpacing: 0.5,
    textAlign: 'left',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl,
  },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.md },
  emptyTitle: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '600', marginBottom: SPACING.sm },
  emptySub: { color: COLORS.muted, fontSize: FONT.md, textAlign: 'center', lineHeight: 28 },
});
