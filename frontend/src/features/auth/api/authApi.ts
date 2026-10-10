/** Sends login and registration requests to the backend. */
import { fetchApi, readApiError } from '../../../shared/api/apiBase';

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: 'student' | 'coach' | 'admin' | string;
  is_superuser: boolean;
  elo_rating: number;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
};

const tokenKey = 'coolchess.accessToken';

async function readError(response: Response) {
  return readApiError(response);
}

function getHeaders(token = getToken()): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getToken() {
  return typeof window === 'undefined' ? null : sessionStorage.getItem(tokenKey);
}

function saveToken(token: string) {
  sessionStorage.setItem(tokenKey, token);
}

export function clearToken() {
  sessionStorage.removeItem(tokenKey);
}

export async function login(email: string, password: string) {
  const body = new URLSearchParams({ username: email.trim(), password });
  const response = await fetchApi('/api/auth/jwt/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(await readError(response));
  const result = await response.json() as TokenResponse;
  saveToken(result.access_token);
  return getMe();
}

export async function register(email: string, password: string, displayName: string) {
  // Роль и стартовый Elo назначает сервер — клиент их не передает.
  // Email тримим; регистр/алиасы нормализует сервер (1 почта = 1 аккаунт).
  const response = await fetchApi('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password, display_name: displayName.trim() }),
  });
  if (response.status === 404) {
    throw new Error('Backend не нашёл маршрут регистрации (/api/auth/register). Проверьте адрес API и перезапустите frontend после изменения VITE_API_URL.');
  }
  if (!response.ok) throw new Error(await readError(response));
}

export async function verifyEmail(email: string, code: string) {
  const response = await fetchApi('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), code: code.trim() }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function resendVerification(email: string) {
  const response = await fetchApi('/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<{ message: string }>;
}

export async function requestPasswordReset(email: string) {
  const response = await fetchApi('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function resetPassword(token: string, password: string) {
  const response = await fetchApi('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function getMe() {
  const response = await fetchApi('/api/users/me', { headers: getHeaders() });
  if (!response.ok) {
    clearToken();
    throw new Error(await readError(response));
  }
  return response.json() as Promise<AuthUser>;
}

export async function logout() {
  const response = await fetchApi('/api/auth/jwt/logout', { method: 'POST', headers: getHeaders() });
  clearToken();
  if (!response.ok && response.status !== 401) throw new Error(await readError(response));
}
