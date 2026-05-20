import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, BackHandler } from 'react-native';
import { useCore, useToggleWatchLater, useWatchLater, useFavorites, useToggleFavorite } from '../store/AppContext';
import SimpleCard from '../components/SimpleCard';
import EpisodePanel from '../components/EpisodePanel';
import SeriesDetailPanel from '../components/SeriesDetailPanel';
import ShadowWrapper from '../components/ShadowWrapper';
import FilterBtn from '../components/FilterBtn';
import Pagination from '../components/Pagination';
import FilterItem from '../components/FilterItem';
import { addSeriesEpisode } from '../services/playlistService';
import { Series } from '../types';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';

const CARD_W = 110;
const CARD_GAP = 8;
const PAGE_SIZE = 30;

interface SeriesScreenProps { onPlayContent: (key: string) => void; onBack: () => void; }

export default function SeriesScreen({ onPlayContent, onBack }: SeriesScreenProps) {
  const { state: { playlist, searchTerm } } = useCore();
  const toggleWl = useToggleWatchLater();
  const wlItems = useWatchLater();
  const favItems = useFavorites();
  const toggleFav = useToggleFavorite();
  const isWl = (key: string) => wlItems.some(w => w.key === key);
  const isFav = (key: string) => favItems.some(f => f.key === key);
  const [activeGroup, setActiveGroup] = useState('Összes sorozat');
  const [activeYear, setActiveYear] = useState('Mind');
  const [activeGenre, setActiveGenre] = useState('Mind');
  const [activeSort, setActiveSort] = useState('Alapértelmezett');
  const [showFilter, setShowFilter] = useState<'group'|'year'|'genre'|'sort'|null>(null);
  const [page, setPage] = useState(0);
  const [showEpisodes, setShowEpisodes] = useState<Series | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);

  const handleClose = useCallback(() => setSelectedSeries(null), []);

  const handleShowEpisodes = useCallback(() => {
    if (!selectedSeries) return;
    setShowEpisodes(selectedSeries);
    setSelectedSeries(null);
  }, [selectedSeries]);

  const handleToggleFav = useCallback(() => {
    if (!selectedSeries) return;
    toggleFav({ key: selectedSeries.key, title: selectedSeries.title, type: 'series', group: selectedSeries.group || '', logo: selectedSeries.logo || '', streamUrl: '', seriesId: '' });
  }, [selectedSeries, toggleFav]);

  const handleToggleWl = useCallback(() => {
    if (!selectedSeries) return;
    toggleWl({ key: selectedSeries.key, title: selectedSeries.title, type: 'series', group: selectedSeries.group || '', logo: selectedSeries.logo || '' });
  }, [selectedSeries, toggleWl]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showEpisodes) { setShowEpisodes(null); return true; }
      if (selectedSeries) { setSelectedSeries(null); return true; }
      onBack();
      return true;
    });
    return () => h.remove();
  }, [onBack]);

  useEffect(() => { setPage(0); }, [activeGroup, activeYear, activeGenre, activeSort, searchTerm]);

  const series = playlist?.series || [];
  const seriesGroups = playlist?.seriesGroups || ['Összes sorozat'];
  const years = useMemo(() => ['Mind', ...([...new Set(series.map(s=>s.year).filter(Boolean))] as string[]).sort((a,b)=>Number(b)-Number(a))], [series]);
  const genres = useMemo(() => ['Mind', ...[...new Set(series.map(s=>s.genre).filter(Boolean))]], [series]);

  const filtered = useMemo(() => {
    let list = series;
    if (activeGroup !== 'Összes sorozat') list = list.filter(s => s.group === activeGroup);
    if (activeYear !== 'Mind') list = list.filter(s => s.year === activeYear);
    if (activeGenre !== 'Mind') list = list.filter(s => s.genre === activeGenre);
    if (searchTerm) list = list.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()));
    if (activeSort === 'A-Z') list = [...list].sort((a,b)=>a.title.localeCompare(b.title));
    if (activeSort === 'Z-A') list = [...list].sort((a,b)=>b.title.localeCompare(a.title));
    if (activeSort === 'Dátum \u2193') list = [...list].sort((a,b)=>Number(b.year)-Number(a.year));
    if (activeSort === 'Dátum \u2191') list = [...list].sort((a,b)=>Number(a.year)-Number(b.year));
    return list;
  }, [series, activeGroup, activeYear, activeGenre, activeSort, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i);
    if (page < 3) return [0,1,2,3,4]; if (page > totalPages - 4) return Array.from({length:5},(_,i)=>totalPages-5+i);
    return [page-2,page-1,page,page+1,page+2];
  }, [page, totalPages]);

  const sortOptions = ['Alapértelmezett', 'A-Z', 'Z-A', 'Dátum \u2193', 'Dátum \u2191'];
  const filterOptions = showFilter==='group'?seriesGroups:showFilter==='year'?years:showFilter==='genre'?genres:showFilter==='sort'?sortOptions:[];

  if (showEpisodes) {
    return (
      <View style={styles.epOverlay}>
        <View style={styles.epPanel}>
          <EpisodePanel seriesId={showEpisodes.seriesId} title={showEpisodes.title}
            onPlayEpisode={async (ep) => {
              await addSeriesEpisode({ key: ep.key, title: ep.title, streamUrl: ep.streamUrl, seriesId: showEpisodes.seriesId, group: showEpisodes.group });
              setShowEpisodes(null); onPlayContent(ep.key);
            }}
            onBack={() => setShowEpisodes(null)} />
        </View>
      </View>
    );
  }

  if (!playlist) return <View style={styles.empty}><Text style={styles.emptyText}>Jelentkezz be a tartalmak eléréséhez.</Text></View>;

  return (
    <View style={{ flex: 1, position: 'relative' }}>
    <ScrollView style={styles.container} nestedScrollEnabled>
      <ShadowWrapper offset={2} borderRadius={4}>
        <View style={styles.filterBox}>
          <Text style={styles.filterLabel}>Szűrés: </Text>
          <FilterBtn label={activeGroup} onPress={()=>setShowFilter(showFilter==='group'?null:'group')}/>
          <FilterBtn label={activeYear==='Mind'?'Év':activeYear} onPress={()=>setShowFilter(showFilter==='year'?null:'year')}/>
          <FilterBtn label={activeGenre==='Mind'?'Műfaj':activeGenre} onPress={()=>setShowFilter(showFilter==='genre'?null:'genre')}/>
          <FilterBtn label={activeSort} onPress={()=>setShowFilter(showFilter==='sort'?null:'sort')}/>
          <Text style={styles.filterTitle}>{'\uD83D\uDCFA'} Sorozatok </Text>
        </View>
      </ShadowWrapper>
      {showFilter && (
        <View style={styles.filterOverlayWrap}>
          <ShadowWrapper offset={6} borderRadius={6}>
            <ScrollView style={styles.filterOverlay} nestedScrollEnabled>
              {filterOptions.map((opt:string) => {
                const isActive = (showFilter==='group'&&opt===activeGroup)||(showFilter==='year'&&opt===activeYear)||(showFilter==='genre'&&opt===activeGenre)||(showFilter==='sort'&&opt===activeSort);
                return <FilterItem key={opt} label={opt} isActive={isActive}
                  onPress={()=>{if(showFilter==='group')setActiveGroup(opt);if(showFilter==='year')setActiveYear(opt);if(showFilter==='genre')setActiveGenre(opt);if(showFilter==='sort')setActiveSort(opt);setShowFilter(null);setPage(0);}} />;
              })}
            </ScrollView>
          </ShadowWrapper>
        </View>
      )}
      {pageItems.length===0 ? <View style={styles.empty}><Text style={styles.emptyText}>Nincs találat.</Text></View> : (
        <View style={styles.gridPanel}><View style={styles.gridWrap}>
          {pageItems.map((item)=><SimpleCard key={item.key} type="series" title={item.title} subtitle={item.group||''} imageUrl={item.logo} onPress={() => setSelectedSeries(item)} onLongPress={() => onPlayContent(item.key)} isWatchLater={isWl(item.key)}/>)}
          {Array.from({length:PAGE_SIZE-pageItems.length}).map((_,i)=><View key={`e-${i}`} style={{width:CARD_W,margin:CARD_GAP/2}}/>)}
        </View></View>
      )}
      {totalPages>1&&<Pagination page={page} totalPages={totalPages} pageNumbers={pageNumbers} onPageChange={setPage}/>}
    </ScrollView>
    {selectedSeries && (
      <SeriesDetailPanel
        seriesId={selectedSeries.seriesId}
        title={selectedSeries.title}
        onClose={handleClose}
        onShowEpisodes={handleShowEpisodes}
        isFav={isFav(selectedSeries.key)}
        onToggleFav={handleToggleFav}
        isWatchLater={isWl(selectedSeries.key)}
        onToggleWatchLater={handleToggleWl}
      />
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,paddingVertical:SPACING.md,paddingHorizontal:20},
  filterBox:{backgroundColor:COLORS.cyan,borderRadius:4,paddingVertical:SPACING.sm,paddingHorizontal:SPACING.lg,flexDirection:'row',alignItems:'center',gap:SPACING.sm,marginBottom:SPACING.sm,flexWrap:'wrap'},filterLabel:{color:COLORS.black,fontFamily:FONT_FAMILY_BANGERS,fontSize:14},
  filterTitle:{color:COLORS.black,fontFamily:FONT_FAMILY_BANGERS,fontSize:16,flex:1,textAlign:'right',marginRight:10},
  filterOverlayWrap:{position:'absolute',top:SPACING.md+40,left:SPACING.md,zIndex:999,elevation:20},filterOverlay:{backgroundColor:COLORS.panel,borderRadius:6,padding:SPACING.xs,maxHeight:300,minWidth:200,maxWidth:350},
  gridPanel:{backgroundColor:'transparent',borderRadius:14,padding:SPACING.sm,marginBottom:SPACING.sm},gridWrap:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:SPACING.md},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:SPACING.xl},emptyText:{color:COLORS.muted,fontSize:FONT.md},
  epOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:COLORS.bg,zIndex:1000,elevation:30},
  epPanel:{flex:1,margin:SPACING.md},
});
