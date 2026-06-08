import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SESSION_TOKEN_KEY = 'pvz.workspaceToken';

export async function getStoredSessionToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getWebStorage()?.getItem(SESSION_TOKEN_KEY) ?? null;
  }

  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

export async function saveSessionToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage()?.setItem(SESSION_TOKEN_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
}

export async function clearSessionToken(): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(SESSION_TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
}

function getWebStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}
