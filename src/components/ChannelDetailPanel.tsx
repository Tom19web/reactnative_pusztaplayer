import { View, Text, Image, ScrollView, StyleSheet, Platform, Dimensions } from 'react-native';
import TFPressable from './TFPressable';
import FavButton from './FavButton';
import EpgPanel from './EpgPanel';
import { Channel } from '../types';
import { COLORS, FONT, SPACING, SIZES } from '../constants';

interface ChannelDetailPanelProps {
  channel: Channel;
  onPlay: (key: string) => void;
}

let isTouch = true;
try { isTouch = !Platform.isTV; } catch {}
const screenH = Dimensions.get('window').height;

export default function ChannelDetailPanel({ channel, onPlay }: ChannelDetailPanelProps) {
  return (
    <ScrollView contentContainerStyle={[s.scroll, isTouch && { paddingBottom: 40 }]} nestedScrollEnabled>
      <View style={s.container}>
        <View style={s.header}>
          {channel.logo ? (
            <Image source={{ uri: channel.logo }} style={s.logo} resizeMode="contain" onError={() => {}} />
          ) : null}
          <View style={s.headerInfo}>
            <Text style={s.title} numberOfLines={2}>{channel.title}</Text>
            <Text style={s.group}>{channel.group}</Text>
          </View>
        </View>

        <View style={s.actions}>
          <FavButton item={{ key: channel.key, title: channel.title, type: 'live', group: channel.group, logo: channel.logo }} />
          <TFPressable style={s.playBtn} focusedStyle={s.playBtnFocused} onPress={() => onPlay(channel.key)}>
            <Text style={s.playBtnText}>▶ Lejátszás</Text>
          </TFPressable>
        </View>

        <EpgPanel streamId={channel.streamId} limit={5} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', padding: SPACING.sm },
  container: {
    width: isTouch ? '100%' : SIZES.detailPanelWidth,
    maxHeight: isTouch ? undefined : screenH * 0.85,
    backgroundColor: COLORS.panel,
    borderRadius: SIZES.radiusSm,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  header: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  logo: { width: 60, height: 60, borderRadius: 8, backgroundColor: COLORS.bg },
  headerInfo: { flex: 1 },
  title: { color: COLORS.text, fontSize: FONT.lg, fontWeight: '700' },
  group: { color: COLORS.muted, fontSize: FONT.sm, marginTop: 2 },
  actions: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'center' },
  playBtn: { backgroundColor: COLORS.yellow, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md, borderRadius: SIZES.radiusSm, borderWidth: 2, borderColor: 'transparent' },
  playBtnFocused: { borderColor: COLORS.white, transform: [{ scale: 1.05 }] },
  playBtnText: { color: COLORS.black, fontWeight: '700', fontSize: FONT.sm },
});
