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
  const { onFocus, onBlur } = useTVFocus();

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
      <Text style={styles.text}>{label}</Text>
    </TFPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: COLORS.cyan,
    borderRadius: 6,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.black,
    borderStyle: 'solid',
  },
  btnFocus: {
    backgroundColor: '#39ff14',
    borderColor: COLORS.black,
  },
  text: { color: COLORS.black, fontFamily: '007Toontime', fontSize: 8 },
});
