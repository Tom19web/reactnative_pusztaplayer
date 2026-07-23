import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

export default function PanelBg() {
  return (
    <LinearGradient
      colors={['#1c1c1c', '#141414', '#0a0a0a']}
      style={StyleSheet.absoluteFill}
    />
  );
}
