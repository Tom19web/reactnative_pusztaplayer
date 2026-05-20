import { Component, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';
import ShadowWrapper from './ShadowWrapper';
import {  COLORS, FONT, SPACING , FONT_FAMILY_BANGERS, FONT_FAMILY_POPPINS, FONT_FAMILY_POPPINS_BOLD } from '../constants';
import * as Sentry from '@sentry/react-native';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message || 'Ismeretlen hiba' };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
    if (!__DEV__) Sentry.captureException(error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <ShadowWrapper offset={8} borderRadius={16}>
            <View style={styles.card}>
              <Text style={styles.title}>{'\u26A0'} Hiba történt</Text>
              <Text style={styles.message}>{this.state.error}</Text>
              <TFPressable
                style={styles.btn}
                focusedStyle={styles.btnFocused}
                onPress={this.handleRetry}
                hasTVPreferredFocus
              >
                <Text style={styles.btnText}>Újrapróbálom</Text>
              </TFPressable>
            </View>
          </ShadowWrapper>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  card: { backgroundColor: COLORS.panel, borderRadius: 16, padding: SPACING.xl, alignItems: 'center', gap: SPACING.md },
  icon: { fontSize: 64 },
  title: { color: COLORS.yellow, fontFamily: FONT_FAMILY_BANGERS, fontSize: FONT.xl, letterSpacing: 0.5 },
  message: { color: COLORS.muted, fontSize: FONT.sm, textAlign: 'center', maxWidth: 500 },
  btn: { backgroundColor: COLORS.yellow, borderRadius: 14, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl },
  btnFocused: { backgroundColor: COLORS.cyan },
  btnText: { color: COLORS.black, fontFamily: FONT_FAMILY_POPPINS_BOLD, fontSize: FONT.md },
});
