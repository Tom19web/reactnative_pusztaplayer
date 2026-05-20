import { useEffect, useState, createContext, useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT, SPACING } from '../constants';

// Windows: @react-native-community/netinfo native module may be null
let NetInfo: any;
try {
  NetInfo = require('@react-native-community/netinfo').default || require('@react-native-community/netinfo');
} catch {
  // Mock NetInfo on Windows — assumes always online
  NetInfo = {
    addEventListener: (cb: any) => {
      cb({ isConnected: true });
      return () => {};
    },
  };
}

interface NetContextType { isOnline: boolean }
const NetContext = createContext<NetContextType>({ isOnline: true });

export function useNetwork() { return useContext(NetContext); }

export function NetProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: any) => {
      setIsOnline(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  return (
    <NetContext.Provider value={{ isOnline }}>
      {children}
      {!isOnline && (
        <View style={styles.banner} pointerEvents="none">
          <Text style={styles.bannerText}>Nincs internetkapcsolat</Text>
        </View>
      )}
    </NetContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.red, padding: SPACING.xs,
    alignItems: 'center', zIndex: 9999, elevation: 100,
  },
  bannerText: { color: COLORS.white, fontSize: FONT.xs, fontWeight: '700' },
});
