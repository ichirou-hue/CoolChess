/** Sends login and registration requests to the backend. */
export type AuthUser = {
  id: string;
  email: string;
  role: 'student' | 'coach' | 'admin' | string;
  elo_rating: number;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
};

const tokenKey = 'coolchess.accessToken';
const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '');

async function readError(response: Response) {
  try {
    const body = await response.json() as { detail?: string | Array<{ msg?: string }> };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((item) => item.msg ?? 'Ошибка проверки данных').join(', ');
  } catch {
    // The server may return an empty or non-JSON response.
  }
  return `Ошибка сервера (${response.status})`;
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
  const body = new URLSearchParams({ username: email, password });
  const response = await fetch(`${apiUrl}/api/auth/jwt/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(await readError(response));
  const result = await response.json() as TokenResponse;
  saveToken(result.access_token);
  return getMe();
}

export async function register(email: string, password: string) {
  // Роль и стартовый Elo назначает сервер — клиент их не передает.
  const response = await fetch(`${apiUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return login(email, password);
}

export async function getMe() {
  const response = await fetch(`${apiUrl}/api/users/me`, { headers: getHeaders() });
  if (!response.ok) {
    clearToken();
    throw new Error(await readError(response));
  }
  return response.json() as Promise<AuthUser>;
}

export async function logout() {
  const response = await fetch(`${apiUrl}/api/auth/jwt/logout`, { method: 'POST', headers: getHeaders() });
  clearToken();
  if (!response.ok && response.status !== 401) throw new Error(await readError(response));
}
