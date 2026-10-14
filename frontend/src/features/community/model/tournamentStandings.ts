import type { TournamentPlayer } from '../api/tournamentsApi';

export type TournamentStanding = { participant: TournamentPlayer; place: number };

// The API exposes current ELO, not results of tournament games. Never use
// registration order as a competitive result. Equal ratings share a place.
export function tournamentStandings(participants: TournamentPlayer[]): TournamentStanding[] {
  const sorted = [...participants].sort((a, b) => b.elo_rating - a.elo_rating
    || a.display_name.localeCompare(b.display_name, 'ru') || a.user_id.localeCompare(b.user_id));
  let place = 1;
  return sorted.map((participant, index) => {
    if (index === 0 || participant.elo_rating !== sorted[index - 1].elo_rating) place = index + 1;
    return { participant, place };
  });
}

export function racePreview(standings: TournamentStanding[], userId?: string) {
  const own = standings.find(({ participant }) => participant.user_id === userId);
  const first = standings.slice(0, 4);
  return own && !first.includes(own) ? [...first.slice(0, 3), own] : first;
}

export function tournamentHref(id: string, playerId?: string) {
  return `#tournaments/${encodeURIComponent(id)}${playerId ? `/${encodeURIComponent(playerId)}` : ''}`;
}

export function tournamentStatus(status: string) {
  return status === 'registration' ? 'Идёт набор' : status === 'ended' ? 'Завершён' : 'Набор закрыт';
}
