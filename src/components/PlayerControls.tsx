import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, ScrollView, StyleSheet, Platform } from 'react-native';
import TFPressable from './TFPressable';
import { PlayIcon, PauseIcon, RewindIcon, ForwardIcon, PrevIcon, NextIcon, RestartIcon, HeartIcon, HeartOutlineIcon, TimerIcon } from '../../assets/icons';
import { COLORS, FONT, SPACING } from '../constants';

let isTV = false;
try { isTV = Platform.isTV; } catch {}

interface PlayerControlsProps {
  paused: boolean;
  isLive: boolean;
  isVod: boolean;
  currentTime: number;
  duration: number;
  title: string;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onRew: () => void;
  onFwd: () => void;
  onRestart?: () => void;
  onPrevChannel?: () => void;
  onNextChannel?: () => void;
  isFav?: boolean;
  onToggleFav?: () => void;
  nowTitle?: string;
  nowTime?: string;
  nowEndTime?: string;
  nowDesc?: string;
  nextTitle?: string;
  nextTime?: string;
  nextEndTime?: string;
  nextDesc?: string;
  seriesEps?: { key: string; title: string; episodeNum: number }[];
  currentEpIdx?: number;
  seasonNum?: string;
  onPlayEpisode?: (key: string) => void;
  logoUrl?: string;
  prevChanName?: string;
  nextChanName?: string;
  resolution?: string;
  vodPlot?: string;
  vodCast?: string;
  vodGenre?: string;
  vodRating?: string;
  vodDirector?: string;
  onBack?: () => void;
  audioTracks?: { index: number; title: string; language?: string }[];
  textTracks?: { index: number; title: string; language?: string }[];
  selectedTextTrackIdx?: number;
  selectedAudioTrackIdx?: number;
  onSelectTextTrack?: (idx: number) => void;
  onSelectAudioTrack?: (idx: number) => void;
  downmixToStereo?: boolean;
  onToggleDownmix?: () => void;
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}



const isMovie = (isVod: boolean, seriesEps?: { key: string; title: string; episodeNum: number }[]) =>
  isVod && (!seriesEps || seriesEps.length === 0);

function PlayerControls({
  paused, isLive, isVod, currentTime, duration, title,
  onPlayPause, onSeek, onRew, onFwd, onRestart, onPrevChannel, onNextChannel,
  isFav, onToggleFav,
  nowTitle, nowTime, nowEndTime, nowDesc, nextTitle, nextTime, nextEndTime, nextDesc,
  seriesEps, currentEpIdx, seasonNum, onPlayEpisode, logoUrl,
  prevChanName, nextChanName, resolution,
  vodPlot, vodCast, vodGenre, vodRating, vodDirector,
  onBack, audioTracks, textTracks, selectedTextTrackIdx, selectedAudioTrackIdx, onSelectTextTrack, onSelectAudioTrack, downmixToStereo, onToggleDownmix,
}: PlayerControlsProps) {
  const [focusedCtrl, setFocusedCtrl] = useState('');
  const ratio = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const movieMode = isMovie(isVod, seriesEps);
  const sF = (sz: number) => isTV ? undefined : { fontSize: Math.max(6, sz - 2) };
  const [showSettings, setShowSettings] = useState(false);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const sleepEndRef = useRef(0);

  useEffect(() => {
    if (sleepRemaining <= 0) return;
    const timer = setInterval(() => {
      const left = Math.round((sleepEndRef.current - Date.now()) / 1000);
      if (left <= 0) { setSleepRemaining(0); onBack?.(); return; }
      setSleepRemaining(left);
    }, 1000);
    return () => clearInterval(timer);
  }, [sleepRemaining > 0]);

  const setSleep = (minutes: number) => {
    if (minutes <= 0) { setSleepRemaining(0); return; }
    sleepEndRef.current = Date.now() + minutes * 60 * 1000;
    setSleepRemaining(minutes * 60);
  };

  const renderControls = () => (
    <View>
      <View style={styles.controlsRow}>
        {isVod && (
          <TFPressable style={styles.ctrlBtn} focusedStyle={styles.ctrlBtnFocus} onPress={onRew}
            onFocus={() => setFocusedCtrl('Visszatekerés')} onBlur={() => setFocusedCtrl('')}>
            <RewindIcon size={20} color={COLORS.black} />
          </TFPressable>
        )}
        {onPrevChannel && (
          <TFPressable style={styles.ctrlBtn} focusedStyle={styles.ctrlBtnFocus} onPress={onPrevChannel}
            onFocus={() => setFocusedCtrl(prevChanName ? `Előző: ${prevChanName}` : 'Előző')} onBlur={() => setFocusedCtrl('')}>
            <PrevIcon size={20} color={COLORS.black} />
          </TFPressable>
        )}
        <TFPressable style={styles.ctrlBtn} focusedStyle={styles.ctrlBtnFocus} onPress={onPlayPause} hasTVPreferredFocus
          onFocus={() => setFocusedCtrl(paused ? 'Lejátszás' : 'Szünet')} onBlur={() => setFocusedCtrl('')}>
          {paused ? <PlayIcon size={20} color={COLORS.black} /> : <PauseIcon size={20} color={COLORS.black} />}
        </TFPressable>
        {isVod && (
          <TFPressable style={styles.ctrlBtn} focusedStyle={styles.ctrlBtnFocus} onPress={onFwd}
            onFocus={() => setFocusedCtrl('Előretekerés')} onBlur={() => setFocusedCtrl('')}>
            <ForwardIcon size={20} color={COLORS.black} />
          </TFPressable>
        )}
        {onNextChannel && (
          <TFPressable style={styles.ctrlBtn} focusedStyle={styles.ctrlBtnFocus} onPress={onNextChannel}
            onFocus={() => setFocusedCtrl(nextChanName ? `Következő: ${nextChanName}` : 'Következő')} onBlur={() => setFocusedCtrl('')}>
            <NextIcon size={20} color={COLORS.black} />
          </TFPressable>
        )}
        {isVod && currentTime > 5 && onRestart && (
          <TFPressable style={styles.ctrlBtn} focusedStyle={styles.ctrlBtnFocus} onPress={onRestart}
            onFocus={() => setFocusedCtrl('Kezdés elölről')} onBlur={() => setFocusedCtrl('')}>
            <RestartIcon size={20} color={COLORS.black} />
          </TFPressable>
        )}
          <TFPressable style={[styles.ctrlBtn, showSettings && styles.ctrlBtnActive]} focusedStyle={styles.ctrlBtnFocus} onPress={() => setShowSettings(s => !s)}
            onFocus={() => setFocusedCtrl('Beállítások')} onBlur={() => setFocusedCtrl('')}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: showSettings ? COLORS.yellow : COLORS.black }}>{'\u2699'}</Text>
          </TFPressable>
        {onBack && (
          <TFPressable style={[styles.ctrlBtn, sleepRemaining > 0 && styles.ctrlBtnActive]} focusedStyle={styles.ctrlBtnFocus} onPress={() => {
            if (sleepRemaining > 0) { setSleep(0); return; }
            setSleep(30);
          }} onFocus={() => setFocusedCtrl(sleepRemaining > 0 ? `⏱ Kikapcs ${Math.floor(sleepRemaining / 60)}:${String(sleepRemaining % 60).padStart(2, '0')}` : '⏱ Időzítő')} onBlur={() => setFocusedCtrl('')}>
            <TimerIcon size={20} color={sleepRemaining > 0 ? COLORS.yellow : COLORS.black} />
          </TFPressable>
        )}
        {onToggleFav && (
          <TFPressable style={styles.ctrlBtn} focusedStyle={styles.ctrlBtnFocus} onPress={onToggleFav}
            onFocus={() => setFocusedCtrl(isFav ? 'Eltávolítás a kedvencekből' : 'Hozzáadás a kedvencekhez')} onBlur={() => setFocusedCtrl('')}>
            {isFav ? <HeartIcon size={20} color={COLORS.red} /> : <HeartOutlineIcon size={20} color={COLORS.black} />}
          </TFPressable>
        )}
      </View>
      {focusedCtrl !== '' && (
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipText}>{focusedCtrl}</Text>
        </View>
      )}
      {showSettings && (
        <View style={styles.settingsOverlay}>
          {textTracks && textTracks.length > 0 && (
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Felirat</Text>
              <View style={styles.settingsOptions}>
                <TFPressable style={[styles.settingsChip, selectedTextTrackIdx === -1 && styles.settingsChipActive]} focusedStyle={styles.settingsChipFocus} onPress={() => onSelectTextTrack?.(-1)}><Text style={[styles.settingsChipText, selectedTextTrackIdx === -1 && styles.settingsChipTextActive]}>Ki</Text></TFPressable>
                {textTracks.map((t, i) => (
                  <TFPressable key={t.index} style={[styles.settingsChip, selectedTextTrackIdx === i && styles.settingsChipActive]} focusedStyle={styles.settingsChipFocus} onPress={() => onSelectTextTrack?.(i)}><Text style={[styles.settingsChipText, selectedTextTrackIdx === i && styles.settingsChipTextActive]}>{t.title}</Text></TFPressable>
                ))}
              </View>
            </View>
          )}
          {audioTracks && audioTracks.length > 1 && (
            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Hang</Text>
              <View style={styles.settingsOptions}>
                {audioTracks.map((t, i) => (
                  <TFPressable key={t.index} style={[styles.settingsChip, selectedAudioTrackIdx === i && styles.settingsChipActive]} focusedStyle={styles.settingsChipFocus} onPress={() => onSelectAudioTrack?.(i)}><Text style={[styles.settingsChipText, selectedAudioTrackIdx === i && styles.settingsChipTextActive]}>{t.title}</Text></TFPressable>
                ))}
              </View>
            </View>
          )}
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Hangzás</Text>
            <View style={styles.settingsOptions}>
              <TFPressable style={[styles.settingsChip, downmixToStereo && styles.settingsChipActive]} focusedStyle={styles.settingsChipFocus} onPress={onToggleDownmix}><Text style={[styles.settingsChipText, downmixToStereo && styles.settingsChipTextActive]}>Sztereó</Text></TFPressable>
              <TFPressable style={[styles.settingsChip, !downmixToStereo && styles.settingsChipActive]} focusedStyle={styles.settingsChipFocus} onPress={onToggleDownmix}><Text style={[styles.settingsChipText, !downmixToStereo && styles.settingsChipTextActive]}>Eredeti</Text></TFPressable>
            </View>
          </View>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>Időzítő</Text>
            <View style={styles.settingsOptions}>
              {sleepRemaining > 0 ? (
                <TFPressable style={[styles.settingsChip, styles.settingsChipActive]} focusedStyle={styles.settingsChipFocus} onPress={() => setSleep(0)}><Text style={styles.settingsChipTextActive}>Kikapcs {Math.floor(sleepRemaining / 60)}:{String(sleepRemaining % 60).padStart(2, '0')}</Text></TFPressable>
              ) : (
                <><TFPressable style={styles.settingsChip} focusedStyle={styles.settingsChipFocus} onPress={() => setSleep(30)}><Text style={styles.settingsChipText}>30p</Text></TFPressable><TFPressable style={styles.settingsChip} focusedStyle={styles.settingsChipFocus} onPress={() => setSleep(60)}><Text style={styles.settingsChipText}>60p</Text></TFPressable></>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );

  const renderInfo = () => {
    // Series
    if (!isLive && seriesEps && seriesEps.length > 0 && currentEpIdx != null && currentEpIdx >= 0) {
      return (
        <View style={styles.channelInfo}>
          <View style={styles.infoTitleRow}>
            <Text style={[styles.channelTitle, sF(styles.channelTitle.fontSize)]}>{title} — {seasonNum}. évad</Text>
            {resolution ? <Text style={[styles.resText, sF(styles.resText.fontSize)]}>{resolution}</Text> : null}
          </View>
          <View style={styles.channelDividerLine} />
          {isVod && (
            <View style={styles.progressRow}>
              <Text style={styles.timeText}>{fmt(currentTime)}</Text>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
              </View>
              <Text style={styles.timeText}>{fmt(duration)}</Text>
            </View>
          )}
          {renderControls()}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.epScroll}>
            <View style={styles.epRow}>
              {seriesEps.map((ep, idx) => (
                <TFPressable
                  key={ep.key}
                  style={[styles.epCard, idx === currentEpIdx && styles.epCardActive]}
                  focusedStyle={styles.epCardFocus}
                  accessibilityLabel={`${ep.title || 'Epizód'} — ${seasonNum}. évad`}
                  accessibilityRole="button"
                  onPress={() => onPlayEpisode?.(ep.key)}
                >
                  <Text style={[styles.epCardText, idx === currentEpIdx && styles.epCardTextActive]} numberOfLines={1}>
                    E{String(ep.episodeNum).padStart(2, '0')}
                  </Text>
                </TFPressable>
              ))}
            </View>
          </ScrollView>
        </View>
      );
    }
    // Movie
    if (movieMode) {
      return (
        <View style={styles.channelInfo}>
          <View style={styles.infoTitleRow}>
            <Text style={[styles.channelTitle, sF(styles.channelTitle.fontSize)]}>{title}</Text>
            {resolution ? <Text style={[styles.resText, sF(styles.resText.fontSize)]}>{resolution}</Text> : null}
          </View>
          <View style={styles.channelDividerLine} />
          {isVod && (
            <View style={styles.progressRow}>
              <Text style={styles.timeText}>{fmt(currentTime)}</Text>
              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
              </View>
              <Text style={styles.timeText}>{fmt(duration)}</Text>
            </View>
          )}
          {renderControls()}
          <View style={styles.movieDetailRow}>
            <View style={styles.moviePlotCol}>
              <Text style={[styles.vodSectionLabel, sF(styles.vodSectionLabel.fontSize)]}>Tartalom:</Text>
              <Text style={[styles.vodPlot, sF(styles.vodPlot.fontSize)]} numberOfLines={5}>{vodPlot || 'Nincs leírás.'}</Text>
            </View>
            <View style={styles.movieMetaCol}>
              {vodDirector ? <View style={styles.metaItem}><Text style={[styles.vodMetaLabel, sF(styles.vodMetaLabel.fontSize)]}>Rendező:</Text><Text style={[styles.vodMeta, sF(styles.vodMeta.fontSize)]} numberOfLines={2}>{vodDirector}</Text></View> : null}
              {vodCast ? <View style={styles.metaItem}><Text style={[styles.vodMetaLabel, sF(styles.vodMetaLabel.fontSize)]}>Szereplők:</Text><Text style={[styles.vodMeta, sF(styles.vodMeta.fontSize)]} numberOfLines={3}>{vodCast}</Text></View> : null}
              <View style={styles.metaRow}>
                {vodGenre ? <View style={styles.tagBox}><Text style={styles.tagText}>{'\uD83C\uDFAD'} {vodGenre}</Text></View> : null}
                {vodRating ? <View style={styles.tagBox}><Text style={styles.tagRating}>{'\u2B50'} {vodRating}</Text></View> : null}
              </View>
            </View>
          </View>
        </View>
      );
    }
    // Live TV
    if (isLive) {
      return (
        <View style={styles.channelInfo}>
          <View style={styles.infoTitleRow}>
            <Text style={[styles.channelTitle, sF(styles.channelTitle.fontSize)]}>{title}</Text>
            {resolution ? <Text style={[styles.resText, sF(styles.resText.fontSize)]}>{resolution}</Text> : null}
          </View>
          <View style={styles.channelDividerLine} />
          {renderControls()}
          <View style={styles.channelBodyRow}>
            {logoUrl ? <Image source={{ uri: logoUrl }} style={styles.channelLogo} resizeMode="contain" /> : null}
            <View style={styles.channelEpgCol}>
              {nowTitle ? (
                <View style={styles.epgNowBox}>
                  <View style={styles.channelRow}>
                    <Text style={[styles.channelTime, sF(styles.channelTime.fontSize)]}>{nowTime}{nowEndTime ? ` \u2013 ${nowEndTime}` : ''}</Text>
                <Text style={[styles.channelNowLabel, sF(styles.channelNowLabel.fontSize)]}>MOST:</Text>
                <Text style={[styles.channelNow, sF(styles.channelNow.fontSize)]} numberOfLines={2}>{nowTitle}</Text>
                  </View>
                  {nowDesc ? <Text style={[styles.epgDesc, sF(styles.epgDesc.fontSize)]} numberOfLines={2}>{nowDesc}</Text> : null}
                </View>
              ) : null}
              {nextTitle ? (
                <View style={styles.channelRow}>
                  <Text style={[styles.channelTime, sF(styles.channelTime.fontSize)]}>{nextTime}{nextEndTime ? ` \u2013 ${nextEndTime}` : ''}</Text>
              <Text style={[styles.channelNext, sF(styles.channelNext.fontSize)]}>Köv:</Text>
              <Text style={[styles.channelNextTitle, sF(styles.channelNextTitle.fontSize)]} numberOfLines={2}>{nextTitle}</Text>
                </View>
              ) : null}
              {!nowTitle && !nextTitle ? (
                <Text style={[styles.noEpgText, sF(styles.noEpgText.fontSize)]}>Nem érhető el elektronikus műsorújság ehhez a csatornához.</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.chanNavRow}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              {prevChanName ? <Text style={[styles.chanNavText, sF(styles.chanNavText.fontSize)]}>Előző: {prevChanName}</Text> : null}
            </View>
            <View style={styles.chanNavDivider} />
            {nextChanName ? <Text style={[styles.chanNavText, sF(styles.chanNavText.fontSize)]}>Következő: {nextChanName}</Text> : <View />}
          </View>
        </View>
      );
    }
    // VOD without extra info — just controls
    return (
      <View style={styles.channelInfo}>
        <View style={styles.infoTitleRow}>
          <Text style={styles.channelTitle}>{title}</Text>
          {resolution ? <Text style={[styles.resText, sF(styles.resText.fontSize)]}>{resolution}</Text> : null}
        </View>
        <View style={styles.channelDividerLine} />
        {isVod && (
          <View style={styles.progressRow}>
            <Text style={styles.timeText}>{fmt(currentTime)}</Text>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
            </View>
            <Text style={styles.timeText}>{fmt(duration)}</Text>
          </View>
        )}
        {renderControls()}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Back button — touchscreen only, top-right */}
      {!isTV && onBack && (
        <TFPressable style={styles.backBtn} focusedStyle={styles.backBtnFocus} onPress={onBack} accessibilityLabel="Vissza" accessibilityRole="button">
          <Text style={styles.backBtnText}>{'\u2190'}</Text>
        </TFPressable>
      )}
      <View style={styles.bottom}>
        {renderInfo()}
      </View>
    </View>
  );
}

export default React.memo(PlayerControls);

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' },
  bottom: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  timeText: { color: COLORS.white, fontSize: FONT.sm, minWidth: 50, textAlign: 'center' },
  progressBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: COLORS.yellow, borderRadius: 3 },
  // Controls — 25% smaller
  controlsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: SPACING.xs },
  tooltipRow: { alignItems: 'center', marginBottom: 2 },
  tooltipText: { color: COLORS.yellow, fontSize: FONT.xs - 2, fontFamily: 'Poppins-Bold' },
  ctrlBtn: { width: 38, height: 38, borderRadius: 8, backgroundColor: COLORS.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.black },
  ctrlBtnFocus: { backgroundColor: COLORS.cyan, transform: [{ scale: 1.06 }] },
  ctrlBtnActive: { borderColor: COLORS.yellow, backgroundColor: 'rgba(255,204,0,0.3)' },
  // Info panel
  channelInfo: { marginTop: SPACING.xs, gap: 4, backgroundColor: 'rgba(0,0,0,0.95)', padding: SPACING.sm, borderRadius: 10 },
  infoTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  channelTitle: { color: COLORS.yellow, fontSize: Math.round(FONT.md * 1.75) - 2, fontFamily: 'Bangers-Regular', letterSpacing: 0.5, paddingBottom: 2, flex: 1 },
  resText: { color: COLORS.cyan, fontSize: FONT.sm - 2, fontFamily: 'Poppins-Bold' },
  channelDividerLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  channelBodyRow: { flexDirection: 'row', gap: SPACING.sm, alignItems: 'flex-start' },
  channelLogo: { width: 100, height: 56, backgroundColor: COLORS.panel2, borderRadius: 6 },
  channelEpgCol: { flex: 1, gap: 4 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  channelNowLabel: { color: COLORS.cyan, fontSize: Math.round(FONT.sm * 1.5) - 4, fontWeight: '700', fontFamily: 'Poppins-Bold' },
  channelNow: { color: COLORS.white, fontSize: Math.round(FONT.sm * 1.5) - 4, fontFamily: 'Poppins-Regular', flex: 1 },
  channelTime: { color: COLORS.muted, fontSize: Math.round(FONT.sm * 1.5) - 4, fontFamily: 'Poppins-Regular' },
  channelNext: { color: COLORS.cyan, fontSize: Math.round(FONT.sm * 1.5) - 4, fontWeight: '700', fontFamily: 'Poppins-Bold', minWidth: 20 },
  channelNextTitle: { color: COLORS.white, fontSize: Math.round(FONT.sm * 1.5) - 4, fontFamily: 'Poppins-Regular', flex: 1 },
  epgNowBox: { backgroundColor: 'rgba(255,204,0,0.1)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 3, borderLeftColor: COLORS.yellow, marginBottom: 2 },
  epgDesc: { color: COLORS.muted, fontSize: Math.round(FONT.sm * 1.2) - 4, fontFamily: 'Poppins-Regular', lineHeight: Math.round(FONT.sm * 1.4), paddingLeft: 2, marginTop: 2 },
  chanNavRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  chanNavText: { color: COLORS.muted, fontSize: FONT.xs + 2, fontFamily: 'Poppins-Regular' },
  chanNavDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  epScroll: { maxHeight: 50 },
  epRow: { flexDirection: 'row', gap: 6 },
  epCard: { backgroundColor: COLORS.panel2, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  epCardActive: { backgroundColor: COLORS.yellow, borderColor: COLORS.black },
  epCardFocus: { borderColor: COLORS.cyan },
  epCardText: { color: COLORS.text, fontSize: FONT.xs - 2, fontWeight: '600' },
  epCardTextActive: { color: COLORS.black },
  noEpgText: { color: COLORS.muted, fontSize: FONT.xs, textAlign: 'center', paddingVertical: SPACING.xs },
  movieDetailRow: { flexDirection: 'row', gap: SPACING.md },
  moviePlotCol: { flex: 3, gap: 4 },
  movieMetaCol: { flex: 2, gap: 6 },
  vodSectionLabel: { color: COLORS.cyan, fontSize: Math.round(FONT.sm * 1.2), fontWeight: '700' },
  vodPlot: { color: COLORS.text, fontSize: Math.round(FONT.sm * 1.1) - 2, lineHeight: Math.round(FONT.sm * 1.6), fontFamily: 'Poppins-Regular' },
  metaRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  vodMetaLabel: { color: COLORS.cyan, fontSize: Math.round(FONT.sm * 1.1) - 2, fontWeight: '700' },
  vodMeta: { color: COLORS.text, fontSize: Math.round(FONT.sm * 1.1) - 2, flex: 1 },
  tagBox: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 9, color: COLORS.text },
  tagRating: { fontSize: 9, color: COLORS.yellow },
  backBtn: { position: 'absolute', top: 20, left: 20, zIndex: 100, width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.7)', borderWidth: 2, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  backBtnFocus: { backgroundColor: '#f6c800', borderColor: '#000' },
  backBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  settingsOverlay: { backgroundColor: 'rgba(0,0,0,0.9)', borderRadius: 8, padding: 8, marginTop: 4, gap: 6 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', fontFamily: 'Poppins-Bold', minWidth: 40 },
  settingsOptions: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  settingsChip: { backgroundColor: COLORS.panel2, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'transparent' },
  settingsChipActive: { borderColor: COLORS.yellow, backgroundColor: 'rgba(255,204,0,0.15)' },
  settingsChipFocus: { borderColor: COLORS.cyan },
  settingsChipText: { color: COLORS.muted, fontSize: 9, fontWeight: '600', fontFamily: 'Poppins-Regular' },
  settingsChipTextActive: { color: COLORS.yellow, fontWeight: '700' },
});
