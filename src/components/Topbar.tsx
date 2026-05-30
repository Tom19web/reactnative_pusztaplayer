import { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import ShadowWrapper from './ShadowWrapper';
import { useCore, useFavorites, useActiveProfile } from '../store/AppContext';
import { useTVFocus } from '../hooks/useTVFocus';
import { useDebounce } from '../hooks/useDebounce';
import { COLORS, FONT, SPACING, SIZES, USER_STATUS_LOGGED_IN } from '../constants';

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
  const displayName = activeProfile?.name || user.nickname || user.email || user.name;
  const initial = isLoggedIn ? (String(displayName || 'P')[0] || '?').toUpperCase() : '?';
  const [showInput, setShowInput] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchTerm);
  const inputRef = useRef<TextInput>(null);
  const debouncedSearch = useDebounce(localSearch, 300);
  const prevSearch = useRef(searchTerm);

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
    const results: { key: string; title: string; type: string; group: string; logo: string }[] = [];
    for (const ch of playlist.liveChannels || []) {
      if (ch.title.toLowerCase().includes(term)) results.push({ key: ch.key, title: ch.title, type: 'live', group: ch.group, logo: ch.logo });
    }
    for (const m of playlist.movies || []) {
      if (m.title.toLowerCase().includes(term)) results.push({ key: m.key, title: m.title, type: 'movie', group: m.group, logo: m.logo });
    }
    for (const s of playlist.series || []) {
      if (s.title.toLowerCase().includes(term)) results.push({ key: s.key, title: s.title, type: 'series', group: s.group, logo: s.logo });
    }
    return results.slice(0, 20);
  }, [searchTerm, showInput, playlist]);

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
});
