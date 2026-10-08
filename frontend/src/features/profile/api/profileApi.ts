/** Reads the student's profile and manages public chess-platform rating sync. */
import { fetchApi, readApiError } from '../../../shared/api/apiBase';

export type StudentProfile = {
  email: string;
  role: string;
  elo_rating: number;
  /** Temporary compatibility alias for the current profile view. */
  elo?: number;
  xp: number;
  level: number;
  coins: number;
  is_verified: boolean;
  lichess_username: string | null;
  lichess_blitz_rating: number | null;
  lichess_rapid_rating: number | null;
  lichess_puzzle_rating: number | null;
  chesscom_username: string | null;
  chesscom_blitz_rating: number | null;
  chesscom_rapid_rating: number | null;
  chesscom_bullet_rating: number | null;
  chesscom_daily_rating: number | null;
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

export type ChessComSyncResult = {
  chesscom_username: string;
  chesscom_blitz_rating: number | null;
  chesscom_rapid_rating: number | null;
  chesscom_bullet_rating: number | null;
  chesscom_daily_rating: number | null;
  message: string;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetchApi(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json() as Promise<T>;
}

export function getStudentProfile() {
  return request<StudentProfile & { elo_rating: number }>('/api/me/profile').then((profile) => ({
    ...profile,
    // Keep the current UI compatible while it is migrated to the server field name.
    elo: profile.elo_rating,
  }));
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

export function syncChessComAccount(chesscomUsername: string) {
  return request<ChessComSyncResult>('/api/users/sync-chesscom', {
    method: 'POST',
    body: JSON.stringify({ chesscom_username: chesscomUsername }),
  });
}
