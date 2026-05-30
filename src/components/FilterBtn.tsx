import { Text, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import { useTVFocus } from '../hooks/useTVFocus';
import { COLORS, FONT, SPACING } from '../constants';

interface FilterBtnProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export default function FilterBtn({ label, onPress, testID }: FilterBtnProps) {
  const { isFocused, onFocus, onBlur } = useTVFocus();

  return (
    <TFPressable
      style={styles.btn}
      focusedStyle={styles.btnFocus}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      testID={testID}
      accessibilityLabel={`${label} szűrő`}
      accessibilityRole="button"
    >
      <Text style={[styles.text, isFocused && styles.textFocus]}>{label}</Text>
    </TFPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: 'rgba(0,255,255,0.15)',
    borderRadius: 6,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(0,255,255,0.3)',
  },
  btnFocus: {
    backgroundColor: 'rgba(255,204,0,0.2)',
    borderColor: COLORS.yellow,
  },
  text: { color: COLORS.cyan, fontFamily: 'Poppins-Bold', fontSize: 12 },
  textFocus: { color: COLORS.yellow },
});
