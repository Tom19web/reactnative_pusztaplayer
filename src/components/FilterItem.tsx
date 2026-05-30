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
      focusedStyle={isActive ? s.itemFocusedActive : s.itemFocused}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <Text style={[s.text, (isActive || isFocused) && s.textActive]}>{label}</Text>
    </TFPressable>
  );
}

const s = StyleSheet.create({
  item: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  itemActive: {
    backgroundColor: 'rgba(0,255,255,0.15)',
    borderColor: 'rgba(0,255,255,0.4)',
  },
  itemFocused: {
    backgroundColor: 'rgba(255,204,0,0.12)',
    borderColor: 'rgba(255,204,0,0.5)',
  },
  itemFocusedActive: {
    backgroundColor: 'rgba(255,204,0,0.2)',
    borderColor: COLORS.yellow,
  },
  text: { color: 'rgba(255,255,255,0.7)', fontSize: FONT.xs },
  textActive: { color: COLORS.white, fontWeight: '700' },
});
