import type { ApiAction, AppState } from './domain/types';
import { applyLocalAction, loadStoredState, saveStoredState } from './localStore';
import {
  OwnerAccessRequiredError,
  loadRemoteState,
  openOwnerSession,
  sendRemoteAction,
} from './remoteStore';

export const ownerSyncEnabled = process.env.EXPO_PUBLIC_PVZ_SYNC_MODE === 'owner';

export { OwnerAccessRequiredError };

export async function loadAppState(): Promise<AppState> {
  return ownerSyncEnabled ? loadRemoteState() : loadStoredState();
}

export async function submitOwnerPassword(password: string): Promise<AppState> {
  return openOwnerSession(password);
}

export async function applyAppAction(state: AppState, action: ApiAction): Promise<AppState> {
  if (ownerSyncEnabled) {
    return sendRemoteAction(action);
  }

  const nextState = applyLocalAction(state, action);
  await saveStoredState(nextState);
  return nextState;
}
