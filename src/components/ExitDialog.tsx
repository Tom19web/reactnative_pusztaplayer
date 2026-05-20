import { useEffect, useState, useRef } from 'react';
import { View, Text, Image, ImageBackground, StyleSheet, Animated, BackHandler, AppState } from 'react-native';
import TFPressable from './TFPressable';
import ShadowWrapper from './ShadowWrapper';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';
import { flush as syncFlush, saveProfilesNow } from '../services/wordpressSync';
import { useCore, useProfiles } from '../store/AppContext';

interface ExitDialogProps {
  onDismiss: () => void;
}

export default function ExitDialog({ onDismiss }: ExitDialogProps) {
  const [exiting, setExiting] = useState(false);
  const fadeStep = useRef(new Animated.Value(0)).current;
  const checkStep = useRef(new Animated.Value(0)).current;
  const fadeBye = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(0)).current;
  const exitingRef = useRef(false);

  const { state: { user } } = useCore();
  const profiles = useProfiles();

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (exitingRef.current) return true;
      onDismiss();
      return true;
    });
    return () => handler.remove();
  }, [onDismiss]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && exitingRef.current) {
        exitingRef.current = false;
        setExiting(false);
        fadeStep.setValue(0);
        checkStep.setValue(0);
        fadeBye.setValue(0);
        fadeOut.setValue(0);
        onDismiss();
      }
    });
    return () => sub.remove();
  }, [onDismiss, fadeStep, checkStep, fadeBye, fadeOut]);

  const handleExit = () => {
    exitingRef.current = true;
    setExiting(true);

    Animated.sequence([
      Animated.timing(fadeStep, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.spring(checkStep, { toValue: 1, speed: 8, bounciness: 12, useNativeDriver: true }),
      Animated.delay(300),
      Animated.timing(fadeBye, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(400),
      Animated.timing(fadeOut, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start(async () => {
      if (user.apiKey && profiles.length > 0) {
        await saveProfilesNow(user.apiKey, profiles);
      }
      await syncFlush();
      BackHandler.exitApp();
    });
  };

  // Goodbye screen
  if (exiting) {
    return (
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: fadeOut }]} pointerEvents="none" />
        <ImageBackground source={require('../../assets/splash-bg.png')} style={styles.goodbyeBg} resizeMode="cover">
          <View style={styles.goodbyeTop}>
            <Image source={require('../../assets/pp-logo.png')} style={styles.goodbyeLogo} resizeMode="contain" />
            <View style={styles.goodbyeTitles}>
              <Text style={styles.goodbyeTitle}>KÖSZÖNJÜK, HOGY </Text>
              <Text style={styles.goodbyeSub}>VELÜNK TARTOTTÁL! </Text>
            </View>
          </View>
          <View style={styles.goodbyeBottom}>
            <View style={styles.goodbyeRow}>
              <Animated.Text style={[styles.goodbyeStep, { opacity: fadeStep }]} numberOfLines={1}>
                A motor leállítása és a szolgáltatás használatából adódó változtatásaid mentése.....
              </Animated.Text>
              <Animated.Text
                style={[styles.goodbyeCheck, {
                  opacity: checkStep,
                  transform: [{ scale: checkStep.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
                }]}
              >
                {'\u2713'}
              </Animated.Text>
            </View>
            <Animated.Text style={[styles.goodbyeBye, { opacity: fadeBye }]}>
              {'\uD83D\uDC4B Várunk vissza mihamarabb! Viszlát!'}
            </Animated.Text>
          </View>
        </ImageBackground>
      </View>
    );
  }

  // Normal dialog
  return (
    <View style={styles.overlay} accessible={true} testID="exit-dialog-overlay">
      <ShadowWrapper offset={6} borderRadius={16}>
        <View style={styles.dialog} testID="exit-dialog-panel">
          <Text style={styles.title} testID="exit-dialog-title">{'\u26A0'} Biztosan kilépsz?</Text>
          <View style={styles.buttons}>
            <ShadowWrapper offset={6} borderRadius={12}>
              <TFPressable
                style={styles.btn}
                focusedStyle={styles.btnFocus}
                onPress={handleExit}
                hasTVPreferredFocus
                testID="exit-btn"
                accessibilityLabel="Kilépés az alkalmazásból"
                accessibilityRole="button"
              >
                <Text style={styles.btnText}>Kilépés</Text>
              </TFPressable>
            </ShadowWrapper>
            <ShadowWrapper offset={6} borderRadius={12}>
              <TFPressable
                style={styles.btn}
                focusedStyle={styles.btnFocus}
                onPress={onDismiss}
                testID="cancel-btn"
                accessibilityLabel="Vissza a kezdőképernyőre"
                accessibilityRole="button"
              >
                <Text style={styles.btnText}>Mégse</Text>
              </TFPressable>
            </ShadowWrapper>
          </View>
        </View>
      </ShadowWrapper>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 999, elevation: 20,
  },
  dialog: {
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: SPACING.lg,
  },
  title: {
    color: COLORS.red,
    fontFamily: FONT_FAMILY_BANGERS,
    fontSize: FONT.xl,
    letterSpacing: 0.5,
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  btn: {
    backgroundColor: '#00FFFF',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.black,
    alignItems: 'center',
  },
  btnFocus: { backgroundColor: '#ffcc00', transform: [{ scale: 0.95 }] },
  btnText: {
    color: COLORS.black,
    fontFamily: FONT_FAMILY_POPPINS_BOLD,
    fontSize: FONT.md,
  },
  goodbyeBg: {
    flex: 1, width: '100%',
  },
  goodbyeTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: 40,
    gap: 24,
  },
  goodbyeLogo: {
    width: 100, height: 100, borderRadius: 20,
  },
  goodbyeTitles: {
    alignItems: 'flex-start',
  },
  goodbyeTitle: {
    color: COLORS.yellow,
    fontSize: 36,
    fontFamily: FONT_FAMILY_BANGERS,
    letterSpacing: 1,
  },
  goodbyeSub: {
    color: COLORS.yellow,
    fontSize: 28,
    fontFamily: FONT_FAMILY_BANGERS,
    letterSpacing: 1,
    marginTop: -2,
  },
  goodbyeBottom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
    gap: 16,
  },
  goodbyeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goodbyeStep: {
    color: COLORS.muted,
    fontSize: 14,
    fontFamily: FONT_FAMILY_POPPINS,
  },
  goodbyeCheck: {
    color: '#4caf50',
    fontSize: 18,
    fontWeight: '800',
  },
  goodbyeBye: {
    color: COLORS.yellow,
    fontSize: 18,
    fontFamily: FONT_FAMILY_POPPINS_BOLD,
    textAlign: 'center',
  },
});
