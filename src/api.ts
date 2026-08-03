import { Platform } from 'react-native';

import type { ApiAction, AppState } from './domain/types';

const nativeApiBaseUrl = 'https://pvz-android.vercel.app';
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') ??
  (Platform.OS === 'web' ? '' : nativeApiBaseUrl);
const NETWORK_ERROR_MESSAGE =
  '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442 \u0438 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.';

type WorkspacePayload = {
  token: string;
  state: AppState;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function fetchState(token: string): Promise<AppState> {
  const response = await fetchApi(`${apiBaseUrl}/api/state`, {
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    throw new ApiRequestError(await getApiError(response), response.status, await getApiCode(response));
  }

  return response.json() as Promise<AppState>;
}

export async function sendAction(token: string, action: ApiAction): Promise<AppState> {
  const response = await fetchApi(`${apiBaseUrl}/api/state`, {
    method: 'POST',
    headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });

  if (!response.ok) {
    throw new ApiRequestError(await getApiError(response), response.status, await getApiCode(response));
  }

  return response.json() as Promise<AppState>;
}

export async function claimInvite(code: string): Promise<WorkspacePayload> {
  const response = await fetchApi(`${apiBaseUrl}/api/invites/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new ApiRequestError(await getApiError(response), response.status, await getApiCode(response));
  }

  return response.json() as Promise<WorkspacePayload>;
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
    throw new ApiRequestError(NETWORK_ERROR_MESSAGE, 0, 'NETWORK_ERROR');
  }
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
      return '\u0411\u0430\u0437\u0430 Neon \u0435\u0449\u0451 \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0430.';
    }

    if (payload.error === 'UNAUTHORIZED') {
      return '\u041d\u0443\u0436\u043d\u043e \u0441\u043d\u043e\u0432\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u041f\u0412\u0417.';
    }

    if (payload.error === 'INVALID_INVITE_CODE') {
      return '\u041a\u043e\u0434 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d \u0438\u043b\u0438 \u0431\u043e\u043b\u044c\u0448\u0435 \u043d\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442.';
    }

    if (payload.error === 'CONFIG_MISSING') {
      return 'Код команды ещё не настроен на сервере.';
    }

    if (payload.error === 'PAYMENT_NOT_FOUND') {
      return 'Эта запись уже изменена или удалена на другом устройстве. Обнови данные и попробуй ещё раз.';
    }

    if (payload.error === 'PAYMENT_UNDO_UNAVAILABLE') {
      return 'Время отмены истекло или запись уже была восстановлена.';
    }

    if (payload.error === 'BAD_REQUEST') {
      return 'Проверь сумму, дату и тип выплаты.';
    }

    return payload.message ?? payload.error ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}
