import { Text, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, FONT } from '../constants';
import { useTVFocus } from '../hooks/useTVFocus';

interface FilterItemProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

export default function FilterItem({ label, isActive, onPress }: FilterItemProps) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TFPressable
      style={[s.item, isActive && s.itemActive]}
      focusedStyle={s.itemFocused}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <Text style={[s.text, (isActive || isFocused) && s.textActive]}>{label}</Text>
    </TFPressable>
  );
}

const s = StyleSheet.create({
  item: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 4, borderWidth: 1, borderColor: 'transparent' },
  itemActive: { backgroundColor: COLORS.cyan, borderColor: '#000' },
  itemFocused: { backgroundColor: '#ffcc00', borderColor: '#000' },
  text: { color: COLORS.text, fontSize: FONT.xs },
  textActive: { color: COLORS.black, fontWeight: '700' },
});
