import type { ApiAction, AppState } from './domain/types';

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ?? '';

export async function fetchState(): Promise<AppState> {
  const response = await fetch(`${apiBaseUrl}/api/state`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('API не найден. Для локального web-preview нужен Vercel dev или EXPO_PUBLIC_API_BASE_URL.');
    }

    throw new Error(await getApiError(response));
  }

  return response.json() as Promise<AppState>;
}

export async function sendAction(action: ApiAction): Promise<AppState> {
  const response = await fetch(`${apiBaseUrl}/api/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('API не найден. Проверь Vercel Functions и Neon DATABASE_URL.');
    }

    throw new Error(await getApiError(response));
  }

  return response.json() as Promise<AppState>;
}

async function getApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.message ?? payload.error ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}
