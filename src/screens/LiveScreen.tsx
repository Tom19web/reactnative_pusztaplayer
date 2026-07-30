import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, BackHandler } from 'react-native';
import { useCore } from '../store/AppContext';
import { useFavorites, useToggleWatchLater, useWatchLater, useToggleFavorite } from '../store/AppContext';
import SimpleCard from '../components/SimpleCard';
import ShadowWrapper from '../components/ShadowWrapper';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import DotPattern from '../components/DotPattern';
import FilterBtn from '../components/FilterBtn';
import Pagination from '../components/Pagination';
import FilterItem from '../components/FilterItem';
import LiveDetailPanel from '../components/LiveDetailPanel';
import { Channel } from '../types';
import { COLORS, FONT, SPACING, qualityLabel } from '../constants';

const CARD_W = 120;
const CARD_GAP = 8;
const PAGE_SIZE = 30;

// Persist filter/page state across component remounts (navigation back from PlayerScreen)
let _savedGroup = 'Összes csatorna';
let _savedPage = 0;

interface LiveScreenProps { onPlayContent: (key: string) => void; onBack: () => void; }

export default function LiveScreen({ onPlayContent, onBack }: LiveScreenProps) {
  const { state: { playlist, searchTerm } } = useCore();
  const toggleWl = useToggleWatchLater();
  const wlItems = useWatchLater();
  const favItems = useFavorites();
  const toggleFav = useToggleFavorite();
  const isWl = (key: string) => wlItems.some(w => w.key === key);
  const isFav = (key: string) => favItems.some(f => f.key === key);
  const [activeGroup, setActiveGroup] = useState(_savedGroup);
  const [showFilter, setShowFilter] = useState(false);
  const [page, setPage] = useState(_savedPage);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const selectedChannelRef = useRef(selectedChannel);
  selectedChannelRef.current = selectedChannel;
  const [selectedQualityIdx, setSelectedQualityIdx] = useState(0);

  const handlePlay = useCallback(() => {
    if (selectedChannel) {
      const qv = selectedChannel.qualityVariants;
      const key = qv && selectedQualityIdx < qv.length ? qv[selectedQualityIdx].key : selectedChannel.key;
      onPlayContent(key);
      setSelectedChannel(null);
    }
  }, [selectedChannel, onPlayContent, selectedQualityIdx]);

  const handleClose = useCallback(() => { setSelectedChannel(null); setSelectedQualityIdx(0); }, []);

  const handleToggleFav = useCallback(() => {
    if (!selectedChannel) return;
    toggleFav({ key: selectedChannel.key, title: selectedChannel.title, type: 'live', group: selectedChannel.group || '', logo: selectedChannel.logo || '', streamUrl: '', seriesId: '' });
  }, [selectedChannel, toggleFav]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedChannelRef.current) { setSelectedChannel(null); return true; }
      onBack();
      return true;
    });
    return () => h.remove();
  }, [onBack]);

  useEffect(() => { _savedPage = 0; setPage(0); }, [activeGroup, searchTerm]);

  const channels = playlist?.liveChannels || [];
  const groups = playlist?.groups || ['Összes csatorna'];

  const filteredChannels = useMemo(() => {
    let list = activeGroup === 'Összes csatorna' ? channels : channels.filter(ch => ch.group === activeGroup);
    if (searchTerm) list = list.filter(ch => ch.title.toLowerCase().includes(searchTerm.toLowerCase()));
    return list;
  }, [channels, activeGroup, searchTerm]);

  // Merge quality variants by base title (SD/HD/FHD → egy kártya)
  function baseTitle(title: string): string {
    return title.replace(/\s+(FHD|HD|SD|4K|UHD|HDR|HEVC|2160P|1080P|720P)\s*$/i, '').trim();
  }
  const displayChannels = useMemo(() => {
    const mergeMap = new Map<string, Channel[]>();
    for (const ch of filteredChannels) {
      if (ch.group === 'Hungarian Radio') continue;
      const key = `${baseTitle(ch.title)}|${ch.group}`;
      const arr = mergeMap.get(key) || [];
      arr.push(ch);
      mergeMap.set(key, arr);
    }
    const seen = new Set<string>();
    const result: Channel[] = [];
    for (const ch of filteredChannels) {
      if (seen.has(ch.key)) continue;
      const key = `${baseTitle(ch.title)}|${ch.group}`;
      const group = mergeMap.get(key);
      if (!group || group.length < 2) {
        result.push(ch); seen.add(ch.key);
        continue;
      }
      const sorted = [...group].sort((a, b) => b.streamId - a.streamId);
      const best = sorted[0];
      const variants = group.map(c => ({
        label: qualityLabel(c.title),
        streamId: c.streamId,
        streamUrl: c.streamUrl,
        key: c.key,
      })).sort((a, b) => {
        const order = ['FHD', 'HD', 'SD'];
        return order.indexOf(a.label) - order.indexOf(b.label);
      });
      result.push({ ...best, qualityVariants: variants });
      group.forEach(c => seen.add(c.key));
    }
    return result;
  }, [filteredChannels]);

  const totalPages = Math.max(1, Math.ceil(displayChannels.length / PAGE_SIZE));
  const pageItems = displayChannels.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i);
    if (page < 3) return [0, 1, 2, 3, 4];
    if (page > totalPages - 4) return Array.from({ length: 5 }, (_, i) => totalPages - 5 + i);
    return [page - 2, page - 1, page, page + 1, page + 2];
  }, [page, totalPages]);

  const filterTop = SPACING.sm + SPACING.sm + SPACING.md + SPACING.md;

  if (!playlist) return (
    <View style={styles.empty} testID="live-empty-nologin">
      <Text style={styles.emptyText}>Jelentkezz be a tartalmak eléréséhez.</Text>
    </View>
  );

  return (
    <View style={styles.wrapper} testID="live-wrapper">
      <ScrollView style={styles.container} nestedScrollEnabled>
        <RuggedBorder color={COLORS.black} wobbleFactor={0.7} style={{ marginBottom: SPACING.md }}>
          <View style={styles.filterBox} testID="live-filter">
            <DotPattern dotColor="#000" dotOpacity={0.15} spacing={6} dotRadius={1.5} />
          <Text style={styles.filterLabel}>Válassz kategóriát! {' '}</Text>
          <FilterBtn label={activeGroup} onPress={() => setShowFilter(!showFilter)} testID="filter-btn-main" />
        </View>
          <SoundEffect text="LIVE!" textColor={COLORS.white} bgColor={COLORS.red} top={-3} right={72} rotate={8} fontSize={28} />
        </RuggedBorder>
        {showFilter && (
          <>
            <View style={styles.filterBgOverlay} pointerEvents="none" />
            <View style={[styles.filterOverlayWrap, { top: filterTop }]} testID="live-filter-overlay">
              <ShadowWrapper offset={6} borderRadius={12}>
                <ScrollView style={styles.filterOverlay} nestedScrollEnabled>
                {groups.map(g => (
                  <FilterItem
                    key={g}
                    label={g}
                    isActive={g === activeGroup}
                    onPress={() => { _savedGroup = g; _savedPage = 0; setActiveGroup(g); setShowFilter(false); setPage(0); }}
                  />
                ))}
              </ScrollView>
            </ShadowWrapper>
          </View>
          </>
        )}
        {pageItems.length === 0 ? (
          <View style={styles.empty} testID="live-empty-noresults">
            <Text style={styles.emptyText}>Nincs találat.</Text>
          </View>
        ) : (
          <View style={styles.gridPanel} testID="live-grid">
            <View style={styles.gridWrap}>
              {pageItems.map((item, idx) => (
                <SimpleCard key={item.key} type="live" title={item.title} subtitle={item.group||''} imageUrl={item.logo}
                  onPress={() => { setSelectedChannel(item); setSelectedQualityIdx(0); }}
                  onLongPress={() => onPlayContent(item.key)}
                  onWatchLater={() => toggleWl({ key: item.key, title: item.title, type: 'live', group: item.group || '', logo: item.logo || '' })}
                  isWatchLater={isWl(item.key)}
                  isFav={isFav(item.key)}
                  badge={item.qualityVariants ? item.qualityVariants.map(v => v.label).join('/') : undefined}
                />
              ))}
              {Array.from({length:PAGE_SIZE-pageItems.length}).map((_,i)=><View key={`e-${i}`} style={{width:CARD_W,margin:CARD_GAP/2}}/>)}
            </View>
            <SoundEffect text="ZAP!" textColor={COLORS.yellow} bgColor={COLORS.red} top={30} right={130} rotate={-8} fontSize={20} />
            <SoundEffect text="BOOM!" textColor={COLORS.white} bgColor={COLORS.cyan} top={150} left={80} rotate={12} fontSize={22} />
            <SoundEffect text="CRACK!" textColor={COLORS.red} bgColor={COLORS.cyan} top={280} right={160} rotate={-12} fontSize={18} />
            <SoundEffect text="POP!" textColor={COLORS.red} bgColor={COLORS.yellow} top={380} left={200} rotate={-6} fontSize={20} />
          </View>
        )}
        {totalPages>1&&<Pagination page={page} totalPages={totalPages} pageNumbers={pageNumbers} onPageChange={(p) => { _savedPage = p; setPage(p); }}/>}
      </ScrollView>

      {/* Live detail panel */}
      {selectedChannel && (
        <LiveDetailPanel
          channel={selectedChannel}
          onPlay={handlePlay}
          onClose={handleClose}
          isFav={isFav(selectedChannel.key)}
          onToggleFav={handleToggleFav}
          selectedQualityIdx={selectedQualityIdx}
          onQualityChange={setSelectedQualityIdx}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:{flex:1,position:'relative'},
  container:{flex:1,paddingVertical:SPACING.md,paddingHorizontal:20},
  filterBox:{position:'relative',backgroundColor:'#ffcc00',borderRadius:0,paddingVertical:SPACING.sm,paddingHorizontal:SPACING.lg,flexDirection:'row',alignItems:'center',gap:SPACING.md,overflow:'hidden'},
  filterLabel:{color:COLORS.black,fontFamily:'Bangers-Regular',fontSize:14},
  filterBgOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.35)',zIndex:998},
  filterOverlayWrap:{position:'absolute',left:SPACING.md,zIndex:999,elevation:20},
  filterOverlay:{backgroundColor:'rgba(0,0,0,0.92)',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,0.08)',padding:SPACING.xs,maxHeight:300,minWidth:200,maxWidth:350},
  gridPanel:{position:'relative',backgroundColor:'transparent',borderRadius:14,padding:SPACING.sm,marginBottom:SPACING.sm},gridWrap:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:SPACING.md},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:SPACING.xl},emptyText:{color:COLORS.muted,fontSize:FONT.md},
});
