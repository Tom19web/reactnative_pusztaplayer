import { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Image } from 'react-native';
import TFPressable from './TFPressable';
import ShadowWrapper from './ShadowWrapper';
import { useCore, useFavorites, useActiveProfile, useBackgroundAudio } from '../store/AppContext';
import { useTVFocus } from '../hooks/useTVFocus';
import { useDebounce } from '../hooks/useDebounce';
import { COLORS, FONT, SPACING, SIZES, USER_STATUS_LOGGED_IN } from '../constants';
import { aiSearchQuery } from '../services/aiProxy';

const RADIUS = SIZES.radiusSm;
const SO = 6;

interface TopbarProps {
  searchTerm: string;
  onSearchChange: (text: string) => void;
  contentWidth: number;
  onPlayContent: (key: string) => void;
  onUserInfo?: () => void;
}

export default function Topbar({ searchTerm, onSearchChange, contentWidth, onPlayContent, onUserInfo }: TopbarProps) {
  const { state: { user, playlist } } = useCore();
  const favorites = useFavorites();
  const activeProfile = useActiveProfile();
  const isLoggedIn = user.status === USER_STATUS_LOGGED_IN;
  const { isFocused: chipFocused, onFocus: onChipFocus, onBlur: onChipBlur } = useTVFocus();
  const { audio, isPlaying, start, stop } = useBackgroundAudio();
  const displayName = activeProfile?.name || user.nickname || user.email || user.name;
  const initial = isLoggedIn ? (String(displayName || 'P')[0] || '?').toUpperCase() : '?';
  const [showInput, setShowInput] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchTerm);
  const inputRef = useRef<TextInput>(null);
  const debouncedSearch = useDebounce(localSearch, 300);
  const prevSearch = useRef(searchTerm);
  const [aiResults, setAiResults] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const aiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runAiSearch = () => {
    if (!localSearch.trim() || !playlist) {
      setAiResults([]);
      return;
    }
    if (aiTimer.current) clearTimeout(aiTimer.current);
    aiTimer.current = setTimeout(async () => {
      setAiLoading(true);
      const items = [
        ...(playlist.movies || []).map(m => ({ key: m.key, title: m.title, type: 'movie', genre: m.genre })),
        ...(playlist.series || []).map(s => ({ key: s.key, title: s.title, type: 'series', genre: s.genre })),
        ...(playlist.liveChannels || []).slice(0, 100).map(c => ({ key: c.key, title: c.title, type: 'live', genre: c.group })),
      ];
      const keys = await aiSearchQuery(localSearch, items);
      setAiResults(keys);
      setAiLoading(false);
    }, 600);
  };

  // Sync debounced local value → global state
  useEffect(() => {
    if (debouncedSearch !== prevSearch.current) {
      prevSearch.current = debouncedSearch;
      onSearchChange(debouncedSearch);
    }
  }, [debouncedSearch, onSearchChange]);

  // When showInput closes without change, keep the value; when opens, sync initial
  useEffect(() => {
    if (showInput) {
      setLocalSearch(searchTerm);
      prevSearch.current = searchTerm;
    }
  }, [showInput]);

  const searchBarWidth = Math.round(contentWidth * 0.45);

  const searchResults = useMemo(() => {
    if (!searchTerm || !showInput || !playlist) return [];
    const term = searchTerm.toLowerCase();
    const results: { key: string; title: string; type: string; group: string; logo: string; isAi?: boolean }[] = [];
    const addedKeys = new Set<string>();
    for (const ch of playlist.liveChannels || []) {
      if (ch.title.toLowerCase().includes(term)) { results.push({ key: ch.key, title: ch.title, type: 'live', group: ch.group, logo: ch.logo }); addedKeys.add(ch.key); }
      if (results.length >= 20) return results;
    }
    for (const m of playlist.movies || []) {
      if (results.length >= 20) return results;
      if (m.title.toLowerCase().includes(term)) { results.push({ key: m.key, title: m.title, type: 'movie', group: m.group, logo: m.logo }); addedKeys.add(m.key); }
    }
    for (const s of playlist.series || []) {
      if (results.length >= 20) return results;
      if (s.title.toLowerCase().includes(term)) { results.push({ key: s.key, title: s.title, type: 'series', group: s.group, logo: s.logo }); addedKeys.add(s.key); }
    }
    // Merge AI results that aren't already found
    for (const aiKey of aiResults) {
      if (results.length >= 20) break;
      if (addedKeys.has(aiKey)) continue;
      const movie = playlist.movies?.find(m => m.key === aiKey);
      if (movie) { results.push({ key: movie.key, title: movie.title, type: 'movie', group: movie.group, logo: movie.logo, isAi: true }); addedKeys.add(aiKey); continue; }
      const series = playlist.series?.find(s => s.key === aiKey);
      if (series) { results.push({ key: series.key, title: series.title, type: 'series', group: series.group, logo: series.logo, isAi: true }); addedKeys.add(aiKey); continue; }
      const ch = playlist.liveChannels?.find(c => c.key === aiKey);
      if (ch) { results.push({ key: ch.key, title: ch.title, type: 'live', group: ch.group, logo: ch.logo, isAi: true }); addedKeys.add(aiKey); }
    }
    return results;
  }, [searchTerm, showInput, playlist, aiResults]);

  return (
    <View style={styles.container}>
      {/* Search bar */}
      {showInput ? (
        <View style={styles.searchGroup}>
          <View style={[styles.searchBar, styles.searchBarFocused, { width: searchBarWidth }]}>
            <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Keress..."
              placeholderTextColor={COLORS.muted}
              value={localSearch}
              onChangeText={setLocalSearch}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => setShowInput(false)}
            />
          </View>
          {searchResults.length > 0 && (
            <View style={styles.searchDropdown}>
              <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                {searchResults.map(item => {
                  const fav = favorites.some(f => f.key === item.key);
                  return (
                    <TFPressable
                      key={item.key}
                      style={styles.dropdownItem}
                      focusedStyle={styles.dropdownItemFocused}
                      onPress={() => { onPlayContent(item.key); setShowInput(false); }}
                    >
                      <Text style={styles.dropdownIcon}>{item.type === 'live' ? '\uD83D\uDCFA' : item.type === 'movie' ? '\uD83C\uDFAC' : '\uD83D\uDCE6'}</Text>
                      <Text style={styles.dropdownTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.dropdownSub} numberOfLines={1}>{item.group}</Text>
                      {item.isAi ? <Text style={styles.dropdownAi}>{'\uD83E\uDD16'}</Text> : null}
                      {fav ? <Text style={styles.dropdownFav}>{'\u2B50'}</Text> : null}
                    </TFPressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      ) : (
        <TFPressable
          style={[styles.searchBar, { width: searchBarWidth }]}
          focusedStyle={styles.searchBarFocused}
          onPress={() => setShowInput(true)}
        >
          <Text style={styles.searchIcon}>{'\uD83D\uDD0D'}</Text>
          <Text style={styles.placeholderText}>
            {searchTerm || 'Keress csatornát, filmet vagy sorozatot.'}
          </Text>
        </TFPressable>
      )}
      {/* AI Search button */}
      {showInput && localSearch.trim() && (
        <TFPressable
          style={[styles.aiBtn, aiLoading && styles.aiBtnLoading]}
          focusedStyle={styles.aiBtnFocused}
          onPress={runAiSearch}
        >
          <Text style={styles.aiBtnText}>{aiLoading ? '\u23F3' : '\uD83E\uDD16'}</Text>
        </TFPressable>
      )}

      {/* Radio capsule */}
      {audio && (
        <ShadowWrapper offset={SO} borderRadius={RADIUS}>
          <TFPressable
            style={[styles.radioCapsule, isPlaying && styles.radioCapsuleActive]}
            focusedStyle={styles.radioCapsuleFocused}
            onPress={() => isPlaying ? stop() : start({ stationName: audio.stationName, stationLogo: audio.stationLogo, streamUrl: audio.streamUrl, streamType: audio.streamType })}
          >
            {audio.stationLogo ? (
              <Image source={{ uri: audio.stationLogo }} style={styles.radioLogo} resizeMode="contain" />
            ) : (
              <Text style={styles.radioIcon}>{'\uD83D\uDCFB'}</Text>
            )}
            <Text style={styles.radioName} numberOfLines={1}>{audio.stationName}</Text>
            <Text style={[styles.radioStop, isPlaying && { color: COLORS.red }]}>{isPlaying ? '\u23F9' : '\u25B6'}</Text>
          </TFPressable>
        </ShadowWrapper>
      )}
      {/* User chip */}
      {isLoggedIn && (
        <ShadowWrapper offset={SO} borderRadius={RADIUS}>
          <TFPressable
            style={styles.userChip}
            focusedStyle={styles.userChipFocused}
            onPress={() => onUserInfo?.()}
            onFocus={onChipFocus}
            onBlur={onChipBlur}
          >
            <View style={styles.avatar}>
              {activeProfile?.avatar ? (
                <Text style={styles.avatarEmoji}>{activeProfile.avatar}</Text>
              ) : (
                <Text style={styles.avatarText}>{initial}</Text>
              )}
            </View>
            <View style={styles.userInfo}>
              <Text style={[styles.username, chipFocused && styles.usernameFocused]} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.userStatus}>bejelentkezve</Text>
            </View>
            <Text style={[styles.userHint, chipFocused && styles.userHintFocused]}>{'\u2699'}</Text>
          </TFPressable>
        </ShadowWrapper>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  searchGroup: { position: 'relative' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cream,
    borderRadius: RADIUS,
    height: 40,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.black,
  },
  searchBarFocused: {
    borderColor: COLORS.yellow,
  },
  searchIcon: {
    fontSize: FONT.md - 4,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    color: COLORS.darkText,
    fontSize: FONT.md - 4,
    fontFamily: 'Poppins-Regular',
    padding: 0,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  placeholderText: {
    flex: 1,
    color: COLORS.muted,
    fontSize: FONT.md - 4,
    fontFamily: 'Poppins-Regular',
  },
  searchDropdown: {
    position: 'absolute',
    top: 42,
    left: 0,
    width: 400,
    maxHeight: 320,
    backgroundColor: COLORS.panel,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.yellow,
    zIndex: 9999,
    elevation: 30,
    overflow: 'hidden',
  },
  dropdownScroll: { padding: SPACING.xs },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', padding: SPACING.xs, borderRadius: 8, gap: SPACING.sm },
  dropdownItemFocused: { backgroundColor: COLORS.cyan },
  dropdownIcon: { fontSize: 14 },
  dropdownTitle: { color: COLORS.text, fontSize: FONT.xs, fontWeight: '600', flex: 1 },
  dropdownSub: { color: COLORS.muted, fontSize: FONT.xs - 4, maxWidth: 100 },
  dropdownFav: { fontSize: 12 },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 25, 25, 0.92)',
    borderRadius: RADIUS,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.black,
  },
  userChipFocused: {
    backgroundColor: COLORS.yellow,
    borderColor: '#00FFFF',
    borderWidth: 1,
  },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 3, borderColor: COLORS.cyan, backgroundColor: COLORS.cyan,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: COLORS.black, fontSize: FONT.sm, fontWeight: '800' },
  avatarEmoji: { fontSize: 22 },
  userInfo: {},
  username: { color: COLORS.text, fontSize: FONT.sm, fontWeight: '700' },
  usernameFocused: { color: COLORS.black },
  userStatus: { color: COLORS.muted, fontSize: FONT.xs },
  userHint: {
    color: COLORS.text,
    fontSize: 20,
  },
  userHintFocused: { color: COLORS.black },
  radioCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#202020',
    borderRadius: RADIUS,
    paddingHorizontal: 10,
    height: 36,
    borderWidth: 1,
    borderColor: '#333',
    gap: 6,
  },
  radioCapsuleActive: { borderColor: COLORS.cyan },
  radioCapsuleFocused: { borderColor: COLORS.yellow },
  radioLogo: { width: 22, height: 22, borderRadius: 3 },
  radioIcon: { fontSize: 16 },
  radioName: { color: COLORS.text, fontSize: FONT.xs, fontWeight: '600', maxWidth: 120 },
  radioStop: { color: COLORS.red, fontSize: 14, marginLeft: 2 },
  aiBtn: {
    width: 36, height: 36, borderRadius: RADIUS,
    backgroundColor: 'rgba(0,255,255,0.1)',
    borderWidth: 1, borderColor: '#333',
    alignItems: 'center', justifyContent: 'center',
  },
  aiBtnLoading: { backgroundColor: 'rgba(255,255,0,0.15)' },
  aiBtnFocused: { borderColor: COLORS.yellow, backgroundColor: 'rgba(0,255,255,0.25)' },
  aiBtnText: { fontSize: 16 },
  dropdownAi: { fontSize: 11, marginLeft: 2 },
});
