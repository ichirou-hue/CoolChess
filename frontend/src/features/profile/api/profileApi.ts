/** Reads the student's profile and manages Lichess account linking. */
export type StudentProfile = {
  email: string;
  role: string;
  elo: number;
  is_verified: boolean;
  lichess_username: string | null;
  lichess_blitz_rating: number | null;
  lichess_rapid_rating: number | null;
  lichess_puzzle_rating: number | null;
};

export type LichessVerification = {
  verification_code: string;
  instructions: string;
};

export type LichessSyncResult = {
  lichess_username: string;
  lichess_blitz_rating: number | null;
  lichess_rapid_rating: number | null;
  lichess_puzzle_rating: number | null;
  updated_elo: number;
  message: string;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8081').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    let message = `Ошибка сервера (${response.status})`;
    try {
      const body = await response.json() as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // Keep the status message if the server did not return JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function getStudentProfile() {
  return request<StudentProfile>('/api/me/profile');
}

export function getLichessVerificationCode() {
  return request<LichessVerification>('/api/users/lichess-verification-code');
}

export function syncLichessAccount(lichessUsername: string) {
  return request<LichessSyncResult>('/api/users/sync-lichess', {
    method: 'POST',
    body: JSON.stringify({ lichess_username: lichessUsername }),
  });
}
