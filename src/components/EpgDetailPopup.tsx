import { useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated } from 'react-native';
import TFPressable from './TFPressable';
import { COLORS, SPACING, FONT, SIZES } from '../constants';
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

  const playBtnRef = useRef<View>(null);

  useEffect(() => {
    const t = setTimeout(() => playBtnRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const slideAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(slideAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [slideAnim]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => onClose());
  }, [onClose, slideAnim]);

  const handleTrapFocus = useCallback(() => {
    playBtnRef.current?.focus();
  }, []);

  return (
    <>
      <View style={styles.focusOverlay} focusable={true} onFocus={handleTrapFocus} />
      <View style={styles.bgOverlay} />
      <View style={styles.focusOverlay} focusable={true} onFocus={handleTrapFocus} />
      <Animated.View style={[styles.container, { opacity: slideAnim, transform: [{ scale: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }]}>
        <TFPressable style={styles.closeBtn} focusedStyle={styles.closeBtnFocus} onPress={handleClose}>
          <Text style={styles.closeBtnText}>{'\u2716'}</Text>
        </TFPressable>
        <ScrollView style={styles.scroll} nestedScrollEnabled>
          <Text style={styles.title}>{prog.title}</Text>
          <Text style={styles.group}>{row.channel.title} | {prog.startTime} – {prog.endTime}</Text>
          {prog.description ? (
            <Text style={styles.desc} numberOfLines={5}>{prog.description}</Text>
          ) : null}
          <View style={styles.buttons}>
            <TFPressable ref={playBtnRef} hasTVPreferredFocus style={styles.btnPlay} focusedStyle={styles.btnPlayFocus} onPress={onPlay}>
              <Text style={styles.btnText}>▶ Nézés most</Text>
            </TFPressable>
            <TFPressable style={styles.btnClose} focusedStyle={styles.btnCloseFocus} onPress={handleClose}>
              <Text style={styles.btnText}>Bezár</Text>
            </TFPressable>
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  focusOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 48,
  },
  bgOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 49,
  },
  container: {
    position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 50,
    width: SIZES.detailPanelWidth, maxHeight: 600,
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderRadius: 10, padding: 10,
  },
  scroll: { gap: 0 },
  closeBtn: {
    position: 'absolute', top: 10, right: 12, zIndex: 10,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.red, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnFocus: { backgroundColor: COLORS.yellow, transform: [{ scale: 1.1 }] },
  closeBtnText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  title: {
    fontSize: 14, color: COLORS.yellow,
    fontFamily: 'Bangers-Regular', letterSpacing: 1, marginBottom: 4,
  },
  group: { fontSize: 8, color: COLORS.muted, marginBottom: 12, fontFamily: 'Poppins-Regular' },
  desc: { fontSize: 11, color: COLORS.text, lineHeight: 16, marginBottom: 16 },
  buttons: { flexDirection: 'column', gap: 4 },
  btnPlay: {
    backgroundColor: COLORS.yellow, borderRadius: 8,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, alignItems: 'center',
  },
  btnPlayFocus: { backgroundColor: COLORS.cyan },
  btnPlayText: { color: COLORS.black, fontSize: FONT.sm, fontWeight: '700' },
  btnClose: {
    backgroundColor: 'transparent', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, alignItems: 'center',
  },
  btnCloseFocus: { borderColor: COLORS.yellow },
  btnCloseText: { color: COLORS.muted, fontSize: FONT.sm },
});
