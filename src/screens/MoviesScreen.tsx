import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, BackHandler } from 'react-native';
import { useCore, useToggleWatchLater, useWatchLater, useFavorites, useToggleFavorite } from '../store/AppContext';
import SimpleCard from '../components/SimpleCard';
import TFPressable from '../components/TFPressable';
import ShadowWrapper from '../components/ShadowWrapper';
import RuggedBorder from '../components/RuggedBorder';
import SoundEffect from '../components/SoundEffect';
import DotPattern from '../components/DotPattern';
import FilterBtn from '../components/FilterBtn';
import MovieDetailPanel from '../components/MovieDetailPanel';
import Pagination from '../components/Pagination';
import FilterItem from '../components/FilterItem';
import { Movie } from '../types';
import { COLORS, FONT, SPACING } from '../constants';
import { getAllMoods, matchesMood } from '../constants/moods';
import { useAIMoods } from '../hooks/useAIMoods';
import { semanticSearch } from '../services/aiProxy';

const CARD_W = 110;
const CARD_GAP = 8;
const PAGE_SIZE = 30;

interface MoviesScreenProps { onPlayContent: (key: string) => void; onBack: () => void; }

export default function MoviesScreen({ onPlayContent, onBack }: MoviesScreenProps) {
  const { state: { playlist, searchTerm } } = useCore();
  const toggleWl = useToggleWatchLater();
  const wlItems = useWatchLater();
  const favItems = useFavorites();
  const toggleFav = useToggleFavorite();
  const isWl = (key: string) => wlItems.some(w => w.key === key);
  const isFav = (key: string) => favItems.some(f => f.key === key);
  const [activeGroup, setActiveGroup] = useState('Összes film');
  const [activeYear, setActiveYear] = useState('Mind');
  const [activeMood, setActiveMood] = useState('Mind');
  const [activeSort, setActiveSort] = useState('Alapértelmezett');
  const [showFilter, setShowFilter] = useState<'group'|'year'|'genre'|'sort'|null>(null);
  const [page, setPage] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticMatches, setSemanticMatches] = useState<Array<{key: string; title: string; type: string; similarity: number}>>([]);

  const handlePlay = useCallback(() => {
    if (selectedMovie) { onPlayContent(selectedMovie.key); setSelectedMovie(null); }
  }, [selectedMovie, onPlayContent]);

  const handleClose = useCallback(() => setSelectedMovie(null), []);

  const handleToggleFav = useCallback(() => {
    if (!selectedMovie) return;
    toggleFav({ key: selectedMovie.key, title: selectedMovie.title, type: 'movie', group: selectedMovie.group || '', logo: selectedMovie.logo || '', streamUrl: '', seriesId: '' });
  }, [selectedMovie, toggleFav]);

  const handleToggleWl = useCallback(() => {
    if (!selectedMovie) return;
    toggleWl({ key: selectedMovie.key, title: selectedMovie.title, type: 'movie', group: selectedMovie.group || '', logo: selectedMovie.logo || '' });
  }, [selectedMovie, toggleWl]);

  const handleOpenSimilar = useCallback((item: { key: string; title: string; type: string; streamId?: number; seriesId?: number }) => {
    setSelectedMovie(null);
    if (item.type === 'movie' && item.streamId) {
      const m = playlist?.movies?.find(m => m.streamId === item.streamId);
      if (m) setTimeout(() => setSelectedMovie(m), 100);
    }
  }, [playlist]);

  useEffect(() => { setPage(0); }, [activeGroup, activeYear, activeMood, activeSort, searchTerm]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showFilter) { setShowFilter(null); return true; }
      if (selectedMovie) { setSelectedMovie(null); return true; }
      onBack();
      return true;
    });
    return () => h.remove();
  }, [onBack, selectedMovie, showFilter]);

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 3) { setSemanticMatches([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSemanticLoading(true);
      const results = await semanticSearch(searchTerm, 8);
      if (cancelled) return;
      const movies = playlist?.movies || [];
      const matched = results
        .filter(r => movies.some(m => m.title.toLowerCase() === r.title.toLowerCase()))
        .map(r => {
          const m = movies.find(m => m.title.toLowerCase() === r.title.toLowerCase())!;
          return { key: m.key, title: m.title, type: m.type, similarity: Math.round(r.similarity * 100) };
        });
      setSemanticMatches(matched);
      setSemanticLoading(false);
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchTerm, playlist]);

  const movies = playlist?.movies || [];
  const movieGroups = playlist?.movieGroups || ['Összes film'];
  const { aiMoods, loading: aiLoading, progress: aiProgress } = useAIMoods(playlist);
  const years = useMemo(() => ['Mind', ...([...new Set(movies.map(m=>m.year).filter(Boolean))] as string[]).sort((a,b)=>Number(b)-Number(a))], [movies]);
  const moods = useMemo(() => {
    const staticMoods = getAllMoods(movies);
    const aiMoodSet = new Set<string>();
    for (const v of Object.values(aiMoods)) {
      for (const m of v) aiMoodSet.add(m);
    }
    const merged = ['Mind'];
    for (const m of staticMoods) if (m !== 'Mind') merged.push(m);
    for (const m of aiMoodSet) if (!merged.includes(m)) merged.push(m);
    return merged;
  }, [movies, aiMoods]);

  const filtered = useMemo(() => {
    let list = movies;
    if (activeGroup !== 'Összes film') list = list.filter(m => m.group === activeGroup);
    if (activeYear !== 'Mind') list = list.filter(m => m.year === activeYear);
    if (activeMood !== 'Mind') list = list.filter(m => {
      if (matchesMood(m.genre, activeMood)) return true;
      const ai = aiMoods[m.key];
      return ai ? ai.includes(activeMood) : false;
    });
    if (searchTerm) list = list.filter(m => m.title.toLowerCase().includes(searchTerm.toLowerCase()));
    if (activeSort === 'A-Z') list = [...list].sort((a,b)=>a.title.localeCompare(b.title));
    if (activeSort === 'Z-A') list = [...list].sort((a,b)=>b.title.localeCompare(a.title));
    if (activeSort === 'Dátum \u2193') list = [...list].sort((a,b)=>Number(b.year)-Number(a.year));
    if (activeSort === 'Dátum \u2191') list = [...list].sort((a,b)=>Number(a.year)-Number(b.year));
    return list;
  }, [movies, activeGroup, activeYear, activeMood, activeSort, searchTerm, aiMoods]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i);
    if (page < 3) return [0,1,2,3,4]; if (page > totalPages - 4) return Array.from({length:5},(_,i)=>totalPages-5+i);
    return [page-2,page-1,page,page+1,page+2];
  }, [page, totalPages]);

  const sortOptions = ['Alapértelmezett', 'A-Z', 'Z-A', 'Dátum \u2193', 'Dátum \u2191'];
  const filterOptions = showFilter==='group'?movieGroups:showFilter==='year'?years:showFilter==='genre'?moods:showFilter==='sort'?sortOptions:[];

  if (!playlist) return <View style={styles.empty}><Text style={styles.emptyText}>Jelentkezz be a tartalmak eléréséhez.</Text></View>;

  return (
    <View style={{ flex: 1, position: 'relative' }}>
    <ScrollView style={styles.container} nestedScrollEnabled>
      {aiLoading && (
        <View style={styles.aiProgressWrap}>
          <View style={[styles.aiProgressBar, { width: `${Math.round(aiProgress * 100)}%` }]} />
        </View>
      )}
      <RuggedBorder color={COLORS.black} wobbleFactor={0.7} style={{ marginBottom: SPACING.md }}>
        <View style={styles.filterBox}>
          <DotPattern dotColor="#000" dotOpacity={0.15} spacing={6} dotRadius={1.5} />
        <Text style={styles.filterLabel}>Szűrés: </Text>
        <FilterBtn label={activeGroup} onPress={()=>setShowFilter(showFilter==='group'?null:'group')}/>
        <FilterBtn label={activeYear==='Mind'?'Év':activeYear} onPress={()=>setShowFilter(showFilter==='year'?null:'year')}/>
        <FilterBtn label={activeMood==='Mind'?'Hangulat':activeMood} onPress={()=>setShowFilter(showFilter==='genre'?null:'genre')}/>
        <FilterBtn label={activeSort} onPress={()=>setShowFilter(showFilter==='sort'?null:'sort')}/>
      </View>
        <SoundEffect text="SORT!" textColor={COLORS.red} bgColor={COLORS.cyan} top={-2} right={-8} rotate={5} fontSize={28} />
      </RuggedBorder>
      {showFilter && (
        <>
          <View style={styles.filterBgOverlay} pointerEvents="none" />
          <View style={styles.filterOverlayWrap}>
            <ShadowWrapper offset={6} borderRadius={6}>
            <ScrollView style={styles.filterOverlay} nestedScrollEnabled>
              {filterOptions.map((opt:string) => {
                const isActive = (showFilter==='group'&&opt===activeGroup)||(showFilter==='year'&&opt===activeYear)||(showFilter==='genre'&&opt===activeMood)||(showFilter==='sort'&&opt===activeSort);
                return <FilterItem key={opt} label={opt} isActive={isActive}
                  onPress={()=>{if(showFilter==='group')setActiveGroup(opt);if(showFilter==='year')setActiveYear(opt);if(showFilter==='genre')setActiveMood(opt);if(showFilter==='sort')setActiveSort(opt);setShowFilter(null);}} />;
              })}
            </ScrollView>
          </ShadowWrapper>
        </View>
        </>
      )}
      {semanticMatches.length > 0 && (
        <View style={styles.aiResults}>
          <Text style={styles.aiResultsLabel}>{'\uD83E\uDD16'} AI tal{String.fromCharCode(225)}latok:</Text>
          <View style={styles.aiResultsRow}>
            {semanticMatches.map(m => (
              <TFPressable key={m.key} style={styles.aiResultCard} focusedStyle={styles.aiResultCardFocus} onPress={() => {
                const item = (playlist?.movies || []).find(x => x.key === m.key);
                if (item) setSelectedMovie(item);
              }}>
                <Text style={styles.aiResultTitle} numberOfLines={1}>{m.title}</Text>
                <Text style={styles.aiResultPct}>{m.similarity}%</Text>
              </TFPressable>
            ))}
          </View>
        </View>
      )}
      {semanticLoading && searchTerm && searchTerm.length >= 3 && (
        <Text style={styles.aiLoading}>{'\u23F3'} AI keres{String.fromCharCode(233)}s...</Text>
      )}
      {pageItems.length===0 ? <View style={styles.empty}><Text style={styles.emptyText}>Nincs találat.</Text></View> : (
          <View style={styles.gridPanel}><View style={styles.gridWrap}>
            {pageItems.map((item)=><SimpleCard key={item.key} type="movie" title={item.title} subtitle={item.group||''} imageUrl={item.logo} onPress={() => setSelectedMovie(item)} onLongPress={() => onPlayContent(item.key)} isWatchLater={isWl(item.key)}/>)}
            {Array.from({length:PAGE_SIZE-pageItems.length}).map((_,i)=><View key={`e-${i}`} style={{width:CARD_W,margin:CARD_GAP/2}}/>)}
          </View>
          <SoundEffect text="KAPOW!" textColor={COLORS.yellow} bgColor={COLORS.red} top={30} left={140} rotate={-12} fontSize={20} />
          <SoundEffect text="ZOOM!" textColor={COLORS.yellow} bgColor={COLORS.cyan} top={160} right={140} rotate={15} fontSize={18} />
          <SoundEffect text="BANG!" textColor={COLORS.white} bgColor={COLORS.red} top={310} left={20} rotate={-6} fontSize={22} />
          <SoundEffect text="ZING!" textColor="#39ff14" bgColor={COLORS.yellow} top={400} right={200} rotate={10} fontSize={18} />
          </View>
      )}
      {totalPages>1&&<Pagination page={page} totalPages={totalPages} pageNumbers={pageNumbers} onPageChange={setPage}/>}
    </ScrollView>
    {selectedMovie && (
      <MovieDetailPanel
        streamId={selectedMovie.streamId}
        title={selectedMovie.title}
        onClose={handleClose}
        onPlay={handlePlay}
        isFav={isFav(selectedMovie.key)}
        onToggleFav={handleToggleFav}
        isWatchLater={isWl(selectedMovie.key)}
        onToggleWatchLater={handleToggleWl}
        onOpenSimilar={handleOpenSimilar}
      />
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,paddingVertical:SPACING.md,paddingHorizontal:20},
  filterBox:{position:'relative',backgroundColor:'#ffcc00',borderRadius:0,paddingVertical:SPACING.sm,paddingHorizontal:SPACING.lg,flexDirection:'row',alignItems:'center',gap:SPACING.sm,flexWrap:'wrap',overflow:'hidden'},
  filterLabel:{color:COLORS.black,fontFamily:'Bangers-Regular',fontSize:14},
  filterBgOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.35)',zIndex:998},
  filterOverlayWrap:{position:'absolute',top:SPACING.md+40,left:SPACING.md,zIndex:999,elevation:20},
  filterOverlay:{backgroundColor:'rgba(0,0,0,0.92)',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,0.08)',padding:SPACING.xs,maxHeight:300,minWidth:200,maxWidth:350},
  gridPanel:{position:'relative',backgroundColor:'transparent',borderRadius:14,padding:SPACING.sm,marginBottom:SPACING.sm},gridWrap:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:SPACING.md},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:SPACING.xl},emptyText:{color:COLORS.muted,fontSize:FONT.md},
  aiProgressWrap:{height:3,backgroundColor:'rgba(255,255,255,0.06)',borderRadius:2,marginBottom:SPACING.xs,overflow:'hidden'},
  aiProgressBar:{height:3,backgroundColor:COLORS.cyan,borderRadius:2},
  aiResults:{marginBottom:SPACING.sm,padding:SPACING.sm,backgroundColor:'rgba(0,255,255,0.06)',borderRadius:8,borderWidth:1,borderColor:'rgba(0,255,255,0.15)'},
  aiResultsLabel:{color:COLORS.cyan,fontSize:FONT.sm,fontFamily:'Bangers-Regular',letterSpacing:0.5,marginBottom:SPACING.xs},
  aiResultsRow:{flexDirection:'row',flexWrap:'wrap',gap:6},
  aiResultCard:{minWidth:90,maxWidth:'30%',backgroundColor:COLORS.panel2,borderRadius:6,padding:6,borderWidth:1,borderColor:'transparent'},
  aiResultCardFocus:{borderColor:COLORS.yellow,backgroundColor:COLORS.panel},
  aiResultTitle:{fontSize:9,color:COLORS.text,lineHeight:11},
  aiResultPct:{fontSize:9,color:COLORS.cyan,fontWeight:'700',marginTop:2},
  aiLoading:{color:COLORS.muted,fontSize:FONT.sm,textAlign:'center',marginBottom:SPACING.sm},
});
