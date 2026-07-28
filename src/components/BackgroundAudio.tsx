import { useEffect, useMemo } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Video from 'react-native-video';
import { useBackgroundAudio } from '../store/AppContext';

export default function BackgroundAudio() {
  const { audio, isPlaying } = useBackgroundAudio();

  useEffect(() => {
    if (!isPlaying || Platform.OS !== 'android') return;
    (async () => {
      try {
        await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
      } catch {}
    })();
  }, [isPlaying]);

  const source = useMemo(() => {
    if (!audio) return undefined;
    return {
      uri: audio.streamUrl,
      type: audio.streamType as any || undefined,
    };
  }, [audio]);

  if (!audio) return null;

  return (
    <Video
      source={source}
      audioOnly
      paused={!isPlaying}
      style={{ width: 0, height: 0, position: 'absolute' }}
      resizeMode="cover"
      ignoreSilentSwitch="ignore"
      progressUpdateInterval={10000}
      showNotificationControls
      metadata={{
        title: audio.stationName,
        subtitle: 'PusztaPlayer Rádió',
        artworkUri: audio.stationLogo || undefined,
      }}
    />
  );
}
