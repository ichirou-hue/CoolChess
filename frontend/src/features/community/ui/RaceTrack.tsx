import { useId } from 'react';
import { racePreview, tournamentHref, type TournamentStanding } from '../model/tournamentStandings';

type Props = {
  standings: TournamentStanding[];
  tournamentId: string;
  userId?: string;
  selectedId?: string;
  onSelect?: (userId: string) => void;
  showLeaderCrown?: boolean;
};

export function RaceTrack({ standings, tournamentId, userId, selectedId, onSelect, showLeaderCrown = false }: Props) {
  const crownGradientId = useId();
  const visible = racePreview(standings, userId);
  const hidden = standings.length - visible.length;
  return <div className="race-course">
    <div className="race-course-caption"><span>Позиции по ELO</span><span>К лидеру →</span></div>
    {standings.length ? <div className="race-course-lanes" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr)) 30px` }} aria-label="Позиции по ELO: лидер справа">
      {[...visible].reverse().map(({ participant, place }) => {
        const isMe = participant.user_id === userId;
        const label = `${participant.display_name}${isMe ? ', это ты' : ''}, место ${place} по ELO, ${participant.elo_rating} ELO`;
        const content = <><b className="race-marker-place">{showLeaderCrown && place === 1 && <svg className="race-marker-crown" viewBox="0 0 32 28" aria-hidden="true" focusable="false">
          <defs><linearGradient id={crownGradientId} x1="0" y1="0" x2="0.8" y2="1"><stop stopColor="#fff2ac" /><stop offset=".45" stopColor="#ffd15b" /><stop offset="1" stopColor="#d98a19" /></linearGradient></defs>
          <path d="M4 9l7 5 5-10 5 10 7-5-3 14H7Z" fill={`url(#${crownGradientId})`} stroke="#a96517" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M8 23h16v3H8Z" fill="#ffdb75" stroke="#b57920" strokeWidth="1" rx="1" />
          <path d="M8 19h16" stroke="#fff3b8" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="4" cy="8" r="2" fill="#ffe895" /><circle cx="16" cy="3" r="2" fill="#fff2b0" /><circle cx="28" cy="8" r="2" fill="#ffe895" />
          <path d="m16 15 2 3-2 3-2-3Z" fill="#7956dc" stroke="#fff0b3" strokeWidth=".8" />
        </svg>}<span>#{place}</span></b><span className="race-marker-avatar">{participant.display_name.trim().charAt(0).toLocaleUpperCase('ru') || '♟'}</span><span className="race-marker-name">{isMe ? 'Ты' : participant.display_name}</span><small>{participant.elo_rating}</small></>;
        const className = `race-marker${isMe ? ' is-me' : ''}${place === 1 ? ' is-leader' : ''}`;
        return onSelect
          ? <button className={className} key={participant.user_id} aria-label={label} aria-pressed={selectedId === participant.user_id} onClick={() => onSelect(participant.user_id)} type="button">{content}</button>
          : <a className={className} key={participant.user_id} aria-label={label} href={tournamentHref(tournamentId, participant.user_id)}>{content}</a>;
      })}
      <span className="race-course-finish" aria-label="Финиш"><span aria-hidden="true">🏁</span></span>
    </div> : <p className="race-course-empty">На старте пока никого. Стань первым участником!</p>}
    <div className="race-course-footnote"><span>Рейтинг участников, не итог турнира</span>{hidden > 0 && <span>Ещё {hidden} — в таблице</span>}</div>
  </div>;
}
