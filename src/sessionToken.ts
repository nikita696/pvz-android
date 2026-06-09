const LEGACY_SESSION_TOKEN = 'legacy-main-workspace';

export async function getStoredSessionToken(): Promise<string | null> {
  return LEGACY_SESSION_TOKEN;
}

export async function saveSessionToken(_token: string): Promise<void> {
  return;
}

export async function clearSessionToken(): Promise<void> {
  return;
}
