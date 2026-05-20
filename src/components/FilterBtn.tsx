import { Text, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import ShadowWrapper from './ShadowWrapper';
import { useTVFocus } from '../hooks/useTVFocus';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';

interface FilterBtnProps {
  label: string;
  onPress: () => void;
  testID?: string;
}

export default function FilterBtn({ label, onPress, testID }: FilterBtnProps) {
  const { isFocused, onFocus, onBlur } = useTVFocus();

  return (
    <ShadowWrapper offset={2} borderRadius={8}>
      <TFPressable
        style={styles.btn}
        focusedStyle={styles.btnFocus}
        onPress={onPress}
        onFocus={onFocus}
        onBlur={onBlur}
        testID={testID}
        accessibilityLabel={`${label} szĹ±rĹ‘`}
        accessibilityRole="button"
      >
        <Text style={[styles.text, isFocused && styles.textFocus]}>{label}</Text>
      </TFPressable>
    </ShadowWrapper>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: COLORS.yellow,
    borderRadius: 6,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.black,
  },
  btnFocus: { transform: [{ scale: 0.95 }], backgroundColor: COLORS.black },
  text: { color: COLORS.black, fontFamily: FONT_FAMILY_POPPINS_BOLD, fontSize: 12 },
  textFocus: { color: COLORS.white },
});
