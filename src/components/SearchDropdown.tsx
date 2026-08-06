import { View, Text, ScrollView, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, FONT, SPACING } from '../constants';
import { Favorite } from '../types';

interface SearchDropdownProps {
  results: { key: string; title: string; type: string; group: string; logo: string; isAi?: boolean; similarity?: number }[];
  favorites: Favorite[];
  onSelect: (key: string) => void;
  onSemanticSelect: (title: string) => void;
}

export default function SearchDropdown({ results, favorites, onSelect, onSemanticSelect }: SearchDropdownProps) {
  if (results.length === 0) return null;
  return (
    <View style={styles.searchDropdown}>
      <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
        {results.map(item => {
          const fav = favorites.some(f => f.key === item.key);
          return (
            <TFPressable
              key={item.key}
              style={styles.dropdownItem}
              focusedStyle={styles.dropdownItemFocused}
              onPress={() => {
                if (item.type === 'semantic') {
                  onSemanticSelect(item.title);
                } else {
                  onSelect(item.key);
                }
              }}
            >
              <Text style={styles.dropdownIcon}>{item.type === 'live' ? '\uD83D\uDCFA' : item.type === 'movie' ? '\uD83C\uDFAC' : '\uD83D\uDCE6'}</Text>
              <Text style={styles.dropdownTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.dropdownSub} numberOfLines={1}>{item.group}</Text>
              {item.isAi ? <Text style={styles.dropdownAi}>{item.similarity ? `\uD83E\uDD16 ${item.similarity}%` : '\uD83E\uDD16'}</Text> : null}
              {fav ? <Text style={styles.dropdownFav}>{'\u2B50'}</Text> : null}
            </TFPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchDropdown: {
    position: 'absolute', top: 34, left: 0, right: 0,
    backgroundColor: COLORS.yellow, borderRadius: 0,
    borderWidth: 3, borderColor: COLORS.black,
    maxHeight: 280, zIndex: 100, overflow: 'hidden',
  },
  dropdownScroll: { padding: 2 },
  dropdownItem: {
    backgroundColor: COLORS.cream, margin: 2, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.black,
  },
  dropdownItemFocused: { backgroundColor: COLORS.black },
  dropdownIcon: { fontSize: 12, width: 20, textAlign: 'center' },
  dropdownTitle: { fontSize: FONT.xs, fontFamily: 'Poppins-SemiBold', color: COLORS.black, flex: 1 },
  dropdownSub: { fontSize: FONT.xs - 2, fontFamily: 'Poppins-Regular', color: COLORS.muted, maxWidth: 100, marginRight: SPACING.xs },
  dropdownAi: { fontSize: FONT.xs - 1, fontFamily: 'Poppins-Regular', color: COLORS.red, marginRight: SPACING.xs },
  dropdownFav: { fontSize: 14, color: COLORS.yellow },
});
