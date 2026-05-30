import { useEffect, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { XtreamEpisode, XtreamSeriesInfo } from '../types';
import { xtreamGetSeriesInfo, buildEpisodeUrl } from '../services/xtreamApi';
import { loadXtreamCredentials } from '../services/storage';
import { COLORS, FONT, SPACING, SIZES } from '../constants';
import TFPressable from './TFPressable';

interface EpisodePanelProps {
  seriesId: number;
  title: string;
  onPlayEpisode: (episode: { key: string; title: string; streamUrl: string }) => void;
  onBack: () => void;
}

export default function EpisodePanel({ seriesId, title, onPlayEpisode, onBack }: EpisodePanelProps) {
  const [seasons, setSeasons] = useState<Record<string, XtreamEpisode[]>>({});
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seriesInfo, setSeriesInfo] = useState<XtreamSeriesInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const creds = await loadXtreamCredentials();
      if (!creds) { setLoading(false); return; }
      try {
        const data = await xtreamGetSeriesInfo(creds.username, creds.password, seriesId);
        if (!cancelled) {
          setSeriesInfo(data);
          setSeasons(data.episodes || {});
          const keys = Object.keys(data.episodes || {}).sort((a, b) => Number(a) - Number(b));
          if (keys.length > 0) setExpandedSeason(keys[0]);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [seriesId]);

  if (loading) {
    return <Text style={styles.loading}>{'\u23F3'} Epizódok betöltése...</Text>;
  }

  const info = seriesInfo?.info;
  const seasonKeys = Object.keys(seasons);
  if (!seasonKeys.length) return <Text style={styles.muted}>Nincsenek epizódok.</Text>;

  const cover = info?.cover || info?.backdrop_path?.[0];
  const genre = info?.genre || '';
  const year = (info?.releaseDate || info?.year || '').slice(0, 4);
  const cast = info?.cast || '';
  const rating = info?.rating || '';
  const plot = (info?.plot || '').slice(0, 450);
  const seasonCount = seasonKeys.length;

  return (
    <ScrollView style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <TFPressable style={styles.backBtn} focusedStyle={styles.backBtnFocus} onPress={onBack} accessibilityLabel="Vissza" accessibilityRole="button">
          <Text style={styles.backBtnText}>Vissza</Text>
        </TFPressable>
      </View>

      {/* 2-column info grid */}
      <View style={styles.infoGrid}>
        <View style={styles.infoLeft}>
          {genre ? <View style={styles.row}><Text style={styles.label}>Műfaj</Text><Text style={styles.value}>{genre}</Text></View> : null}
          {year ? <View style={styles.row}><Text style={styles.label}>Év</Text><Text style={styles.value}>{year}</Text></View> : null}
          {cast ? <View style={styles.row}><Text style={styles.label}>Szereplők</Text><Text style={styles.value} numberOfLines={3}>{cast}</Text></View> : null}
          {rating ? <View style={styles.row}><Text style={styles.label}>Értékelés</Text><Text style={[styles.value, { color: COLORS.yellow }]}>{'\u2605'} {rating}</Text></View> : null}
          {seasonCount > 0 ? <View style={styles.row}><Text style={styles.label}>Évadok</Text><Text style={styles.value}>{seasonCount}</Text></View> : null}
        </View>
        <View style={styles.infoRight}>
          {cover ? <Image source={{ uri: cover }} style={styles.poster} resizeMode="cover" /> : null}
        </View>
      </View>

      {/* Divider + plot */}
      {plot ? (
        <View style={styles.plotSection}>
          <View style={styles.divider} />
          <Text style={styles.plot} numberOfLines={6}>{plot}{plot.length >= 450 ? '\u2026' : ''}</Text>
        </View>
      ) : null}

      {/* Episodes */}
      {seasonKeys.map(seasonNum => (
        <View key={seasonNum} style={styles.seasonBlock}>
          <TFPressable
            style={styles.seasonHeader}
            focusedStyle={styles.seasonHeaderFocus}
            onPress={() => setExpandedSeason(expandedSeason === seasonNum ? null : seasonNum)}
            accessibilityLabel={`${seasonNum}. évad ${expandedSeason === seasonNum ? 'összecsukása' : 'kibontása'}`}
            accessibilityRole="button"
          >
            <Text style={styles.seasonTitle}>{expandedSeason === seasonNum ? '\u25BD' : '\u25B6'} {seasonNum}. évad</Text>
            <Text style={styles.epCount}>{seasons[seasonNum].length} epizód</Text>
          </TFPressable>

          {expandedSeason === seasonNum && (
            <View style={styles.episodeList}>
              {seasons[seasonNum].map((ep: XtreamEpisode) => {
                const ext = ep.container_extension || 'm3u8';
                const epKey = `ep_${ep.id}`;
                return (
                  <TFPressable
                    key={ep.id}
                    style={styles.epCard}
                    focusedStyle={styles.epCardFocus}
                    accessibilityLabel={`${ep.title || `Epizód ${ep.episode_num}`}`}
                    accessibilityRole="button"
                    onPress={() => {
                      loadXtreamCredentials().then(creds => {
                        if (!creds) return;
                        const url = buildEpisodeUrl(creds.username, creds.password, ep.id, ext);
                        onPlayEpisode({ key: epKey, title: ep.title || `Epizód ${ep.episode_num}`, streamUrl: url });
                      });
                    }}
                  >
                    <View style={styles.epBadge}>
                      <Text style={styles.epBadgeText}>S{seasonNum.padStart(2, '0')}E{String(ep.episode_num || '').padStart(2, '0')}</Text>
                    </View>
                    <Text style={styles.epTitle} numberOfLines={2}>{ep.title || `Epizód ${ep.episode_num}`}</Text>
                  </TFPressable>
                );
              })}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center', marginTop: SPACING.lg },
  muted: { color: COLORS.muted, fontSize: FONT.sm },
  // Header
  header: {
    backgroundColor: COLORS.yellow,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#000',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  headerTitle: {
    color: COLORS.black,
    fontFamily: 'Bangers-Regular',
    fontSize: FONT.lg + 2,
    flex: 1,
    letterSpacing: 0.5,
  },
  backBtn: {
    backgroundColor: '#00FFFF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  backBtnFocus: {
    backgroundColor: '#ffcc00',
    transform: [{ scale: 0.95 }],
  },
  backBtnText: { color: COLORS.black, fontSize: FONT.sm, fontFamily: 'Poppins-Bold' },
  // Info grid
  infoGrid: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  infoLeft: { flex: 1, justifyContent: 'space-between' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  label: { color: COLORS.muted, fontSize: FONT.xs + 4, minWidth: 65 },
  value: { color: COLORS.text, fontSize: FONT.xs + 4, fontWeight: '500', flex: 1, textAlign: 'right' },
  infoRight: { width: 100, height: 150, backgroundColor: COLORS.bg, borderRadius: 8, overflow: 'hidden' },
  poster: { width: '100%', height: '100%' },
  // Plot
  plotSection: { marginBottom: SPACING.md },
  divider: { height: 1, backgroundColor: COLORS.border, marginBottom: SPACING.sm },
  plot: { color: COLORS.text, fontSize: FONT.xs, lineHeight: FONT.sm },
  // Seasons
  seasonBlock: { marginBottom: SPACING.sm },
  seasonHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.panel, padding: SPACING.sm, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  seasonHeaderFocus: { borderColor: COLORS.yellow },
  seasonTitle: { color: COLORS.text, fontSize: FONT.md, fontWeight: '600' },
  epCount: { color: COLORS.muted, fontSize: FONT.sm },
  episodeList: { marginTop: 4, gap: 4 },
  epCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.panel, padding: SPACING.sm, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  epCardFocus: { borderColor: COLORS.yellow, backgroundColor: COLORS.panel2 },
  epBadge: { backgroundColor: COLORS.panel2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  epBadgeText: { color: COLORS.cyan, fontSize: FONT.xs, fontWeight: '700' },
  epTitle: { color: COLORS.text, fontSize: FONT.sm, flex: 1 },
});
