import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Tournament, TournamentPlayer } from '../api/tournamentsApi';
import { tournamentStandings } from '../model/tournamentStandings';
import { RaceTrack } from './RaceTrack';

export function RaceStandings({ tournament, userId, initialPlayerId, renderActions }: {
  tournament: Tournament;
  userId?: string;
  initialPlayerId?: string;
  renderActions?: (participant: TournamentPlayer) => ReactNode;
}) {
  const standings = tournamentStandings(tournament.participants);
  const own = standings.find(({ participant }) => participant.user_id === userId);
  const [selectedId, setSelectedId] = useState(initialPlayerId ?? userId ?? '');
  const [query, setQuery] = useState('');
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const selected = standings.find(({ participant }) => participant.user_id === selectedId) ?? own ?? standings[0];
  const next = selected && [...standings].reverse().find(({ participant }) => participant.elo_rating > selected.participant.elo_rating);
  const visible = standings.filter(({ participant }) => `${participant.display_name} ${participant.group_name ?? ''}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));

  useEffect(() => { setSelectedId(initialPlayerId ?? userId ?? ''); }, [initialPlayerId, userId]);

  function showMyPlace() {
    if (!own) return;
    setQuery('');
    setSelectedId(own.participant.user_id);
    // Wait for the search reset to render the row before moving keyboard focus.
    requestAnimationFrame(() => {
      const row = rows.current.get(own.participant.user_id);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }

  return <div className="race-standings">
    <div className="race-arena">
      <div className="race-arena-heading"><div><span className="race-eyebrow">НА ОДНОЙ ДОРОЖКЕ</span><h3>Кто впереди?</h3></div><span className="race-arena-count">{standings.length} игроков</span></div>
      <p>Нажми на игрока, чтобы сравнить рейтинг.{own ? ' Твой круг выделен лаймовой обводкой.' : ''}</p>
      <RaceTrack standings={standings} tournamentId={tournament.id} userId={userId} selectedId={selected?.participant.user_id} onSelect={setSelectedId} />
      {selected && <div className="race-player-focus" aria-live="polite" aria-atomic="true">
        <span className="race-focus-place">#{selected.place}<small>по ELO</small></span>
        <div><strong>{selected.participant.display_name}{selected.participant.user_id === userId ? ' · Ты' : ''}</strong><span>{selected.participant.elo_rating} ELO · {next ? `${next.participant.elo_rating - selected.participant.elo_rating} ELO до места #${next.place}` : 'Лидер по рейтингу'}</span></div>
      </div>}
    </div>
    <div className="race-table-panel">
      <div className="race-table-heading"><div><span className="race-eyebrow">ВСЕ УЧАСТНИКИ</span><h3>Таблица позиций</h3></div>{own && <button className="race-my-place" type="button" onClick={showMyPlace}>◎ Моё место · #{own.place}</button>}</div>
      <p className="race-table-explanation">Места по текущему ELO. При одинаковом рейтинге место общее. Результаты партий организатор подведёт отдельно.</p>
      <label className="race-search"><span>Найти игрока или группу</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Имя или группа" /></label>
      <div className="race-table-columns" aria-hidden="true"><span>Место</span><span>Игрок</span><span>ELO</span></div>
      <ol className="race-table" aria-label="Места участников по ELO">
        {visible.map(({ participant, place }) => <li key={participant.user_id} className={`race-table-row${participant.user_id === userId ? ' is-me' : ''}${selected?.participant.user_id === participant.user_id ? ' is-selected' : ''}`}>
          <button className="race-table-player" type="button" ref={element => { if (element) rows.current.set(participant.user_id, element); else rows.current.delete(participant.user_id); }} aria-pressed={selected?.participant.user_id === participant.user_id} onClick={() => setSelectedId(participant.user_id)}>
            <span className={`race-table-place${place <= 3 ? ' podium' : ''}`} aria-label={`Место ${place}`}>{place === 1 ? <span aria-hidden="true">♛</span> : null}#{place}</span>
            <span className="race-table-name"><strong>{participant.display_name}{participant.user_id === userId && <em>Ты</em>}</strong><small>{participant.group_name ? `Группа ${participant.group_name}` : 'Без группы'}{participant.preferred_color ? ` · ${participant.preferred_color === 'white' ? 'Белые' : participant.preferred_color === 'black' ? 'Чёрные' : 'Случайная сторона'}` : ''}</small></span>
            <span className="race-table-rating">{participant.elo_rating}</span>
          </button>
          {selected?.participant.user_id === participant.user_id && <p className="race-row-detail">{next ? `До места #${next.place} — ${next.participant.elo_rating - participant.elo_rating} ELO. При равном ELO место общее.` : 'Самый высокий ELO среди участников.'}</p>}
          {renderActions?.(participant)}
        </li>)}
      </ol>
      {!visible.length && <div className="race-search-empty"><p>{standings.length ? 'Такого игрока или группы нет.' : 'Участников пока нет. Таблица появится после первой записи.'}</p>{query && <button type="button" className="race-my-place" onClick={() => setQuery('')}>Сбросить поиск</button>}</div>}
      <p className="race-table-count" role="status">Показано {visible.length} из {standings.length}</p>
    </div>
  </div>;
}
