import { View, Text, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';
import { useTVFocus } from '../hooks/useTVFocus';

interface PaginationProps {
  page: number;
  totalPages: number;
  pageNumbers: number[];
  onPageChange: (page: number) => void;
}

function PageButton({ onPress, active, disabled, children, label }: {
  onPress: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode; label?: string;
}) {
  const { isFocused, onFocus, onBlur } = useTVFocus();
  return (
    <TFPressable
      style={[styles.btn, active && styles.btnActive, disabled && styles.btnDisabled]}
      focusedStyle={active ? {} : styles.btnFocus}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Text style={[
        styles.btnText,
        (active || isFocused) ? styles.btnTextFocus : {},
        disabled && styles.btnTextDisabled,
      ]}>{children}</Text>
    </TFPressable>
  );
}

export default function Pagination({ page, totalPages, pageNumbers, onPageChange }: PaginationProps) {
  return (
    <View style={styles.row} testID="pagination">
      <PageButton label="Els\u0151 oldal" onPress={() => page > 0 && onPageChange(0)} disabled={page === 0}>{'|\u25C1'}</PageButton>
      <PageButton label="El\u0151z\u0151 oldal" onPress={() => page > 0 && onPageChange(page - 1)} disabled={page === 0}>{'\u2190'}</PageButton>
      {pageNumbers.map(p => (
        <PageButton key={p} label={`${p + 1}. oldal`} onPress={() => onPageChange(p)} active={p === page}>{p + 1}</PageButton>
      ))}
      <PageButton label="K\u00F6vetkez\u0151 oldal" onPress={() => page < totalPages - 1 && onPageChange(page + 1)} disabled={page >= totalPages - 1}>{'\u2192'}</PageButton>
      <PageButton label="Utols\u00F3 oldal" onPress={() => page < totalPages - 1 && onPageChange(totalPages - 1)} disabled={page >= totalPages - 1}>{'\u25B7|'}</PageButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.lg, marginBottom: SPACING.md },
  btn: { backgroundColor: COLORS.panel, borderRadius: 8, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderWidth: 2, borderColor: 'transparent' },
  btnActive: { backgroundColor: COLORS.cyan },
  btnDisabled: { opacity: 0.3 },
  btnFocus: { backgroundColor: COLORS.yellow },
  btnText: { color: COLORS.text, fontSize: FONT.sm, fontFamily: FONT_FAMILY_BANGERS },
  btnTextFocus: { color: COLORS.black },
  btnTextDisabled: { color: COLORS.muted },
});
