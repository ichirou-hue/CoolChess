/** Единая база для всех API-клиентов CoolChess.
 *
 * Проблема "failed to fetch при регистрации":
 * фронт хардкодил VITE_API_URL=http://localhost:8080, а backend за nginx
 * доступен только через :80 (/api/ -> backend:8080) или напрямую :8080
 * в dev. Плюс CORS_ORIGINS без :5173 резал preflight из Vite.
 * Теперь по умолчанию apiUrl = '' (относительные /api/...):
 * - за nginx работает через тот же origin;
 * - в `npm run dev` работает через proxy в vite.config.ts (без CORS).
 * Явный VITE_API_URL по-прежнему поддерживается для прямых схем.
 */

const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
export const apiUrl = rawApiUrl.replace(/\/$/, '');

function apiPath(path: string) {
  return `${apiUrl}${path}`;
}

const FRIENDLY_DETAILS: Record<string, string> = {
  REGISTER_USER_ALREADY_EXISTS: 'Пользователь с таким email уже зарегистрирован.',
  UPDATE_USER_EMAIL_ALREADY_EXISTS: 'Пользователь с таким email уже зарегистрирован.',
  LOGIN_BAD_CREDENTIALS: 'Неверный email или пароль.',
  LOGIN_USER_NOT_VERIFIED: 'Аккаунт не подтвержден.',
};

export function translateDetail(detail: unknown): string | null {
  if (typeof detail === 'string') {
    return FRIENDLY_DETAILS[detail] ?? detail;
  }
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === 'string') return translateDetail(item) ?? item;
      if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg?: string }).msg ?? 'Ошибка проверки данных');
      return 'Ошибка проверки данных';
    });
    return parts.join(', ');
  }
  if (detail && typeof detail === 'object') {
    const obj = detail as { code?: string; reason?: string };
    if (obj.code && FRIENDLY_DETAILS[obj.code]) {
      return obj.reason ? `${FRIENDLY_DETAILS[obj.code]} ${obj.reason}` : FRIENDLY_DETAILS[obj.code];
    }
    if (obj.code) return obj.reason ? `${obj.code}: ${obj.reason}` : obj.code;
  }
  return null;
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    const translated = translateDetail(body.detail);
    if (translated) return translated;
  } catch {
    // Сервер вернул пустой или не-JSON ответ.
  }
  return `Ошибка сервера (${response.status})`;
}

export function toNetworkError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      'Сервер недоступен (failed to fetch). Проверьте, что backend запущен: ' +
        'локально `uvicorn server:app --port 8080` из backend/ или `docker compose up -d` ' +
        'для прод-режима через nginx.',
    );
  }
  return error instanceof Error ? error : new Error('Неизвестная ошибка сети');
}

export async function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(apiPath(path), init);
  } catch (error) {
    throw toNetworkError(error);
  }
}

/** WS-URL с учетом относительного apiUrl (тот же хост, ws/wss по протоколу страницы). */
export function wsUrlFor(path: string): string {
  if (apiUrl) return `${apiUrl.replace(/^http/, 'ws')}${path}`;
  if (typeof window === 'undefined') return path;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}
