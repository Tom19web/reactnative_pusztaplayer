/**
 * WindowsConfig - reads credentials from environment variables.
 */
import { NativeModules } from 'react-native';

const { PusztaWindowsConfig } = NativeModules;

export async function getWindowsCredentials(): Promise<{ url: string; user: string; pass: string }> {
  try {
    if (PusztaWindowsConfig && PusztaWindowsConfig.getCredentials) {
      await PusztaWindowsConfig.getCredentials();
    }
  } catch (e) {
    // Native module not available
  }
  return { url: '', user: '', pass: '' };
}
