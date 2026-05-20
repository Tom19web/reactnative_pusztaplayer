import { View, Text, Image, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import FavButton from './FavButton';
import EpgPanel from './EpgPanel';
import { Channel } from '../types';
import { COLORS, FONT, SPACING, SIZES } from '../constants';

interface ChannelDetailPanelProps {
  channel: Channel;
  onPlay: (key: string) => void;
}

export default function ChannelDetailPanel({ channel, onPlay }: ChannelDetailPanelProps) {
  return (
    <View style={styles.container}>
      {/* Header: logo + title + play + fav */}
      <View style={styles.header}>
        {channel.logo ? (
          <Image
            source={{ uri: channel.logo }}
            style={styles.logo}
            resizeMode="contain"
            onError={() => {}}
          />
        ) : null}
        <View style={styles.headerInfo}>
          <Text style={styles.title} numberOfLines={2}>{channel.title}</Text>
          <Text style={styles.group}>{channel.group}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <FavButton item={{
          key: channel.key,
          title: channel.title,
          type: 'live',
          group: channel.group,
          logo: channel.logo,
        }} />
        <TFPressable
          style={styles.playBtn}
          focusedStyle={styles.playBtnFocused}
          onPress={() => onPlay(channel.key)}
        >
          <Text style={styles.playBtnText}>â–ş LejĂˇtszĂˇs</Text>
        </TFPressable>
      </View>

      {/* EPG */}
      <EpgPanel streamId={channel.streamId} limit={5} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZES.detailPanelWidth,
    backgroundColor: COLORS.panel,
    borderRadius: SIZES.radiusSm,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT.lg,
    fontWeight: '700',
  },
  group: {
    color: COLORS.muted,
    fontSize: FONT.sm,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  playBtn: {
    backgroundColor: COLORS.yellow,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: SIZES.radiusSm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  playBtnFocused: {
    borderColor: COLORS.white,
    transform: [{ scale: 1.05 }],
  },
  playBtnText: {
    color: COLORS.black,
    fontWeight: '700',
    fontSize: FONT.sm,
  },
});
