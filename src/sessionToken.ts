import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const SESSION_TOKEN_KEY = 'pvz.workspaceToken';

export async function getStoredSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(SESSION_TOKEN_KEY);
  }

  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function saveSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}
