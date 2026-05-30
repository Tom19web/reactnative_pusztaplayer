import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import TFPressable from './TFPressable';

interface DevLoginFormProps {
  onBack: () => void;
  onLogin: (email: string, password: string) => void;
  loading: boolean;
  error: string;
}

export default function DevLoginForm({ onBack, onLogin, loading, error }: DevLoginFormProps) {
  const [devEmail, setDevEmail] = useState('');
  const [devPass, setDevPass] = useState('');

  const handlePress = () => {
    if (!devEmail.trim() || !devPass.trim()) return;
    onLogin(devEmail.trim(), devPass.trim());
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>PUSZTAPLAYER</Text>
      <Text style={styles.subtitle}>DEVELOPER LOGIN</Text>
      <View style={styles.divider} />
      <TextInput
        style={styles.input}
        placeholder="E-mail cím"
        placeholderTextColor="#555"
        value={devEmail}
        onChangeText={setDevEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="WordPress jelszó"
        placeholderTextColor="#555"
        value={devPass}
        onChangeText={setDevPass}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TFPressable
        style={styles.btnPrimary}
        focusedStyle={styles.btnPrimaryFocus}
        onPress={handlePress}
        disabled={loading}
        accessibilityLabel="Bejelentkezés"
        accessibilityRole="button"
      >
        <Text style={styles.btnPrimaryText}>{loading ? '...' : 'BEJELENTKEZÉS'}</Text>
      </TFPressable>
      {error ? <Text style={styles.error}>{'\u26A0 ' + error}</Text> : null}
      <TFPressable
        style={styles.btnGhost}
        focusedStyle={styles.btnGhostFocus}
        onPress={onBack}
        accessibilityLabel="Vissza"
        accessibilityRole="button"
      >
        <Text style={styles.btnGhostText}>VISSZA</Text>
      </TFPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#141414',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#000',
    paddingVertical: 24,
    paddingHorizontal: 28,
    width: 400,
    alignItems: 'center',
  },
  title: {
    color: '#f6c800',
    fontSize: 32,
    fontFamily: 'Bangers-Regular',
    letterSpacing: 3,
  },
  subtitle: {
    color: '#555',
    fontSize: 8,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  divider: {
    height: 2,
    backgroundColor: '#1a1a1a',
    alignSelf: 'stretch',
    marginVertical: 14,
  },
  input: {
    alignSelf: 'stretch',
    backgroundColor: '#0d0d0d',
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    marginBottom: 8,
  },
  btnPrimary: {
    alignSelf: 'stretch',
    backgroundColor: '#f6c800',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#000',
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnPrimaryFocus: { backgroundColor: '#1fd6e8' },
  btnPrimaryText: {
    color: '#000',
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  error: {
    color: '#ff4d57',
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
    marginTop: 8,
    textAlign: 'center',
  },
  btnGhost: {
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#1a1a1a',
    paddingVertical: 7,
    alignItems: 'center',
    marginTop: 10,
  },
  btnGhostFocus: { borderColor: '#f6c800' },
  btnGhostText: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'Poppins-Bold',
    letterSpacing: 1,
  },
});
