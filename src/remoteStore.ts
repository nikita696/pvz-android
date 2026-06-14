import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { ApiAction, AppState } from './domain/types';

const nativeApiBaseUrl = 'https://pvz-android.vercel.app';
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  (Platform.OS === 'web' ? '' : nativeApiBaseUrl);
const OWNER_SESSION_KEY = 'pvz.ownerSessionToken';
const NETWORK_ERROR_MESSAGE =
  '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442 \u0438 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.';

type OwnerSessionPayload = {
  token: string;
  state: AppState;
};

export class OwnerAccessRequiredError extends Error {
  constructor() {
    super('OWNER_ACCESS_REQUIRED');
  }
}

export class RemoteRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function loadRemoteState(): Promise<AppState> {
  const token = await getOwnerSessionToken();

  if (!token) {
    throw new OwnerAccessRequiredError();
  }

  try {
    return await fetchRemoteState(token);
  } catch (error) {
    if (isUnauthorized(error)) {
      await clearOwnerSessionToken();
      throw new OwnerAccessRequiredError();
    }

    throw error;
  }
}

export async function sendRemoteAction(action: ApiAction): Promise<AppState> {
  const token = await getOwnerSessionToken();

  if (!token) {
    throw new OwnerAccessRequiredError();
  }

  try {
    return await postRemoteAction(token, action);
  } catch (error) {
    if (isUnauthorized(error)) {
      await clearOwnerSessionToken();
      throw new OwnerAccessRequiredError();
    }

    throw error;
  }
}

export async function openOwnerSession(password: string): Promise<AppState> {
  const response = await fetchApi(`${apiBaseUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new RemoteRequestError(await getApiError(response), response.status, await getApiCode(response));
  }

  const payload = (await response.json()) as OwnerSessionPayload;
  await AsyncStorage.setItem(OWNER_SESSION_KEY, payload.token);
  return payload.state;
}

export async function clearOwnerSessionToken(): Promise<void> {
  await AsyncStorage.removeItem(OWNER_SESSION_KEY);
}

async function getOwnerSessionToken(): Promise<string | null> {
  return AsyncStorage.getItem(OWNER_SESSION_KEY);
}

async function fetchRemoteState(token: string): Promise<AppState> {
  const response = await fetchApi(`${apiBaseUrl}/api/state`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    throw new RemoteRequestError(await getApiError(response), response.status, await getApiCode(response));
  }

  return response.json() as Promise<AppState>;
}

async function postRemoteAction(token: string, action: ApiAction): Promise<AppState> {
  const response = await fetchApi(`${apiBaseUrl}/api/state`, {
    method: 'POST',
    headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });

  if (!response.ok) {
    throw new RemoteRequestError(await getApiError(response), response.status, await getApiCode(response));
  }

  return response.json() as Promise<AppState>;
}

function getAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function fetchApi(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new RemoteRequestError(NETWORK_ERROR_MESSAGE, 0, 'NETWORK_ERROR');
  }
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof RemoteRequestError && error.status === 401;
}

async function getApiCode(response: Response): Promise<string> {
  try {
    const payload = (await response.clone().json()) as { error?: string };
    return payload.error ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}

async function getApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.clone().json()) as { error?: string; message?: string };

    if (payload.error === 'DATABASE_URL_MISSING') {
      return '\u0411\u0430\u0437\u0430 \u041f\u0412\u0417 \u0435\u0449\u0451 \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0430.';
    }

    if (payload.error === 'UNAUTHORIZED') {
      return '\u041d\u0443\u0436\u0435\u043d \u0432\u0445\u043e\u0434 \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430.';
    }

    if (payload.error === 'INVALID_OWNER_PASSWORD') {
      return '\u041f\u0430\u0440\u043e\u043b\u044c \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430 \u043d\u0435 \u043f\u043e\u0434\u043e\u0448\u0451\u043b.';
    }

    if (payload.error === 'CONFIG_MISSING') {
      return '\u041f\u0430\u0440\u043e\u043b\u044c \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430 \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435.';
    }

    return payload.message ?? payload.error ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}
