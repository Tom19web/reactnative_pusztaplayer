import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, BackHandler } from 'react-native';
import { useCore, useToggleWatchLater, useWatchLater, useFavorites, useToggleFavorite } from '../store/AppContext';
import SimpleCard from '../components/SimpleCard';
import ShadowWrapper from '../components/ShadowWrapper';
import FilterBtn from '../components/FilterBtn';
import MovieDetailPanel from '../components/MovieDetailPanel';
import Pagination from '../components/Pagination';
import FilterItem from '../components/FilterItem';
import { Movie } from '../types';
import { COLORS, FONT, SPACING } from '../constants';

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
  const [activeGenre, setActiveGenre] = useState('Mind');
  const [activeSort, setActiveSort] = useState('Alapértelmezett');
  const [showFilter, setShowFilter] = useState<'group'|'year'|'genre'|'sort'|null>(null);
  const [page, setPage] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

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

  useEffect(() => { setPage(0); }, [activeGroup, activeYear, activeGenre, activeSort, searchTerm]);

  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedMovie) { setSelectedMovie(null); return true; }
      onBack();
      return true;
    });
    return () => h.remove();
  }, [onBack]);

  const movies = playlist?.movies || [];
  const movieGroups = playlist?.movieGroups || ['Összes film'];
  const years = useMemo(() => ['Mind', ...([...new Set(movies.map(m=>m.year).filter(Boolean))] as string[]).sort((a,b)=>Number(b)-Number(a))], [movies]);
  const genres = useMemo(() => ['Mind', ...[...new Set(movies.map(m=>m.genre).filter(Boolean))]], [movies]);

  const filtered = useMemo(() => {
    let list = movies;
    if (activeGroup !== 'Összes film') list = list.filter(m => m.group === activeGroup);
    if (activeYear !== 'Mind') list = list.filter(m => m.year === activeYear);
    if (activeGenre !== 'Mind') list = list.filter(m => m.genre === activeGenre);
    if (searchTerm) list = list.filter(m => m.title.toLowerCase().includes(searchTerm.toLowerCase()));
    if (activeSort === 'A-Z') list = [...list].sort((a,b)=>a.title.localeCompare(b.title));
    if (activeSort === 'Z-A') list = [...list].sort((a,b)=>b.title.localeCompare(a.title));
    if (activeSort === 'Dátum \u2193') list = [...list].sort((a,b)=>Number(b.year)-Number(a.year));
    if (activeSort === 'Dátum \u2191') list = [...list].sort((a,b)=>Number(a.year)-Number(b.year));
    return list;
  }, [movies, activeGroup, activeYear, activeGenre, activeSort, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i);
    if (page < 3) return [0,1,2,3,4]; if (page > totalPages - 4) return Array.from({length:5},(_,i)=>totalPages-5+i);
    return [page-2,page-1,page,page+1,page+2];
  }, [page, totalPages]);

  const sortOptions = ['Alapértelmezett', 'A-Z', 'Z-A', 'Dátum \u2193', 'Dátum \u2191'];
  const filterOptions = showFilter==='group'?movieGroups:showFilter==='year'?years:showFilter==='genre'?genres:showFilter==='sort'?sortOptions:[];

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
          <Text style={styles.filterTitle}>{'\uD83C\uDFAC'} Filmek </Text>
        </View>
      </ShadowWrapper>
      {showFilter && (
        <>
          <View style={styles.filterBgOverlay} pointerEvents="none" />
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
        </>
      )}
      {pageItems.length===0 ? <View style={styles.empty}><Text style={styles.emptyText}>Nincs találat.</Text></View> : (
          <View style={styles.gridPanel}><View style={styles.gridWrap}>
            {pageItems.map((item)=><SimpleCard key={item.key} type="movie" title={item.title} subtitle={item.group||''} imageUrl={item.logo} onPress={() => setSelectedMovie(item)} onLongPress={() => onPlayContent(item.key)} isWatchLater={isWl(item.key)}/>)}
            {Array.from({length:PAGE_SIZE-pageItems.length}).map((_,i)=><View key={`e-${i}`} style={{width:CARD_W,margin:CARD_GAP/2}}/>)}
          </View></View>
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
      />
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,paddingVertical:SPACING.md,paddingHorizontal:20},
  filterBox:{backgroundColor:'rgba(0,255,255,0.08)',borderRadius:8,borderWidth:1,borderColor:'rgba(0,255,255,0.15)',paddingVertical:SPACING.sm,paddingHorizontal:SPACING.lg,flexDirection:'row',alignItems:'center',gap:SPACING.sm,marginBottom:SPACING.sm,flexWrap:'wrap'},
  filterLabel:{color:COLORS.cyan,fontFamily:'Bangers-Regular',fontSize:14},
  filterTitle:{color:COLORS.cyan,fontFamily:'Bangers-Regular',fontSize:16,flex:1,textAlign:'right',marginRight:10},
  filterBgOverlay:{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.35)',zIndex:998},
  filterOverlayWrap:{position:'absolute',top:SPACING.md+40,left:SPACING.md,zIndex:999,elevation:20},
  filterOverlay:{backgroundColor:'rgba(0,0,0,0.92)',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,0.08)',padding:SPACING.xs,maxHeight:300,minWidth:200,maxWidth:350},
  gridPanel:{backgroundColor:'transparent',borderRadius:14,padding:SPACING.sm,marginBottom:SPACING.sm},gridWrap:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:SPACING.md},
  empty:{flex:1,alignItems:'center',justifyContent:'center',padding:SPACING.xl},emptyText:{color:COLORS.muted,fontSize:FONT.md},
});
