import { Text, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import { useFavorites, useToggleFavorite } from '../store/AppContext';
import { COLORS, SPACING, SIZES } from '../constants';
import { Favorite } from '../types';

interface FavButtonProps {
  item: {
    key: string;
    title: string;
    type: 'live' | 'movie' | 'series';
    group?: string;
    logo?: string;
    streamUrl?: string;
    seriesId?: string;
  };
}

export default function FavButton({ item }: FavButtonProps) {
  const favorites = useFavorites();
  const toggleFav = useToggleFavorite();
  const isFav = favorites.some(f => f.key === item.key);

  const handlePress = () => {
    toggleFav({
      key: item.key,
      title: item.title,
      type: item.type,
      group: item.group || '',
      logo: item.logo || '',
      streamUrl: item.streamUrl || '',
      seriesId: item.seriesId || '',
    });
  };

  return (
    <TFPressable
      style={[styles.btn, isFav && styles.btnActive]}
      focusedStyle={styles.btnFocused}
      onPress={handlePress}
    >
      <Text style={[styles.btnText, isFav && styles.btnTextActive]}>
        {isFav ? 'â™Ą' : 'â™ˇ'}
      </Text>
    </TFPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: SIZES.radiusSm,
    backgroundColor: COLORS.panel2,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: COLORS.red,
  },
  btnFocused: {
    borderColor: COLORS.white,
    transform: [{ scale: 1.1 }],
  },
  btnText: {
    color: COLORS.text,
    fontSize: 22,
  },
  btnTextActive: {
    color: COLORS.white,
  },
});
