import { useMemo } from 'react';
import Video from 'react-native-video';
import { useBackgroundAudio } from '../store/AppContext';

export default function BackgroundAudio() {
  const { audio, isPlaying } = useBackgroundAudio();

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
    />
  );
}
