import { View } from 'react-native';

interface ShadowWrapperProps {
  offset?: number;
  borderRadius?: number;
  style?: any;
  children: React.ReactNode;
}

export default function ShadowWrapper({
  offset = 12,
  borderRadius = 16,
  style,
  children,
}: ShadowWrapperProps) {
  return (
    <View style={{ paddingRight: offset, paddingBottom: offset }}>
      <View
        style={{
          position: 'absolute',
          top: offset,
          left: offset,
          right: 0,
          bottom: 0,
          backgroundColor: '#000',
          borderRadius,
        }}
      />
      <View style={[{ borderRadius }, style]}>
        {children}
      </View>
    </View>
  );
}
