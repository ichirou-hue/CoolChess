/** Reads the public leaderboard and the signed-in student's rank. */
export type LeaderboardCategory = 'elo' | 'level' | 'puzzles';

export type LeaderboardPlayer = {
  rank: number;
  user_id: string;
  email: string;
  elo_rating: number;
  level: number;
  xp: number;
  puzzles_solved: number;
};

export type LeaderboardResponse = {
  category: LeaderboardCategory;
  top_players: LeaderboardPlayer[];
  my_rank: Omit<LeaderboardPlayer, 'user_id' | 'email'> | null;
};

const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8081').replace(/\/$/, '');

export async function getLeaderboard(category: LeaderboardCategory = 'elo', limit = 20) {
  const token = sessionStorage.getItem('coolchess.accessToken');
  const response = await fetch(`${apiUrl}/api/leaderboard?${new URLSearchParams({ category, limit: String(limit) })}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
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
  return response.json() as Promise<LeaderboardResponse>;
}
