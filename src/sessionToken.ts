import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { clearLastSuccessfulSnapshot } from './localSnapshot';

const SESSION_TOKEN_KEY = 'pvz.workspaceToken';

export async function getStoredSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(SESSION_TOKEN_KEY);
  }

  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function saveSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    return;
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } else {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  }

  try {
    await clearLastSuccessfulSnapshot();
  } catch {
    // Removing the access token must still succeed if a best-effort local
    // recovery file cannot be deleted on this device.
  }
}
