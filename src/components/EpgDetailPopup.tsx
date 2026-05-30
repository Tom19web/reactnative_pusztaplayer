import { View, Text, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, SPACING, FONT } from '../constants';
import { EpgRow } from '../hooks/useEpg';

interface Props {
  row: EpgRow;
  progIdx: number;
  onPlay: () => void;
  onClose: () => void;
}

export default function EpgDetailPopup({ row, progIdx, onPlay, onClose }: Props) {
  const prog = row.programs[progIdx];
  if (!prog) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.popup}>
        <Text style={styles.title}>{prog.title}</Text>
        <Text style={styles.meta}>{row.channel.title} | {prog.startTime} - {prog.endTime}</Text>
        {prog.description ? (
          <Text style={styles.desc} numberOfLines={5}>{prog.description}</Text>
        ) : null}
        <View style={styles.actions}>
          <TFPressable style={styles.btn} focusedStyle={styles.btnFocus} onPress={onPlay} hasTVPreferredFocus>
            <Text style={styles.btnText}>▶ Nézés most</Text>
          </TFPressable>
          <TFPressable style={styles.btnGhost} focusedStyle={styles.btnGhostFocus} onPress={onClose}>
            <Text style={styles.btnGhostText}>Bezár</Text>
          </TFPressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  popup: { width: 500, backgroundColor: COLORS.panel, borderRadius: 14, borderWidth: 2, borderColor: COLORS.cyan, padding: SPACING.lg },
  title: { color: COLORS.yellow, fontSize: FONT.lg, fontFamily: 'Bangers-Regular', marginBottom: SPACING.xs },
  meta: { color: COLORS.muted, fontSize: FONT.sm, marginBottom: SPACING.md },
  desc: { color: COLORS.text, fontSize: FONT.sm, lineHeight: 20, marginBottom: SPACING.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.md },
  btn: { backgroundColor: COLORS.yellow, borderRadius: 10, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg },
  btnFocus: { backgroundColor: COLORS.cyan },
  btnText: { color: COLORS.black, fontSize: FONT.md, fontFamily: 'Poppins-Bold' },
  btnGhost: { backgroundColor: 'transparent', borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg },
  btnGhostFocus: { borderColor: COLORS.yellow },
  btnGhostText: { color: COLORS.muted, fontSize: FONT.md, fontFamily: 'Poppins-Regular' },
});
