import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/model/AuthProvider';
import * as tournamentsApi from '../api/tournamentsApi';
import type { Tournament, TournamentColor } from '../api/tournamentsApi';
import { TournamentCountdown } from './TournamentCountdown';
import { RaceStandings } from './RaceStandings';
import { tournamentHref, tournamentStatus } from '../model/tournamentStandings';

function readEventLocation() {
  const [, id = '', playerId = ''] = window.location.hash.split('/');
  try { return { id: decodeURIComponent(id), playerId: decodeURIComponent(playerId) }; }
  catch { return { id: '', playerId: '' }; }
}

const formatLabels: Record<Tournament['format'], string> = {
  round_robin: 'Круговой',
  swiss: 'Швейцарская система',
  single_elimination: 'На выбывание',
};

const colorLabels: Record<TournamentColor, string> = {
  white: 'Белые',
  black: 'Чёрные',
  random: 'Случайная сторона',
};

const winnerRules: Record<Tournament['format'], string> = {
  round_robin: 'Очки: победа — 1, ничья — ½. При равенстве решает личная встреча.',
  swiss: 'Очки: победа — 1, ничья — ½. При равенстве учитываются результаты соперников.',
  single_elimination: 'Побеждает игрок, выигравший финальную партию сетки на выбывание.',
};

export function TournamentPage() {
  const { user } = useAuth();
  const canManage = Boolean(user?.is_superuser || user?.role === 'coach' || user?.role === 'admin');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [players, setPlayers] = useState<tournamentsApi.TournamentUser[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(readEventLocation);

  useEffect(() => {
    const sync = () => setLocation(readEventLocation());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const refresh = async () => {
    const [items, availablePlayers] = await Promise.all([
      tournamentsApi.listTournaments(),
      canManage ? tournamentsApi.listTournamentPlayers() : Promise.resolve([]),
    ]);
    setTournaments(items);
    setPlayers(availablePlayers);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      tournamentsApi.listTournaments(),
      canManage ? tournamentsApi.listTournamentPlayers() : Promise.resolve([]),
    ]).then(([items, availablePlayers]) => {
      if (active) {
        setTournaments(items);
        setPlayers(availablePlayers);
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить турниры.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canManage]);

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось выполнить действие.');
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await runAction(async () => {
      await tournamentsApi.createTournament({
        name: String(form.get('name') ?? '').trim(),
        description: String(form.get('description') ?? '').trim(),
        format: String(form.get('format') ?? 'round_robin') as Tournament['format'],
        time_control: Number(form.get('time_control')),
        increment: Number(form.get('increment')),
        max_players: Number(form.get('max_players')),
        duration_hours: Number(form.get('duration_hours')),
        prize: String(form.get('prize') ?? '').trim(),
      });
      formElement.reset();
    }, 'Турнир создан.');
  };

  const selectedTournament = tournaments.find(item => item.id === location.id);
  const shownTournaments = location.id ? tournaments.filter(item => item.id === location.id) : tournaments;

  return <section className="tournaments-page">
    <header className="tournaments-heading">
      <a className="race-back" href={location.id ? '#tournaments' : '#community'}>← {location.id ? 'Все события' : 'Сообщество'}</a>
      <span className="eyebrow"><span>08</span> СОБЫТИЯ COOLCHESS</span>
      <h1>{location.id ? selectedTournament?.name ?? 'Событие' : <>Турниры<br /><em>и команды.</em></>}</h1>
      <p>Найди себя на дорожке, сравни рейтинг и познакомься с соперниками.</p>
    </header>
    {error && <p className="puzzle-reward" role="alert">{error}</p>}
    {message && <p className="tournament-status" role="status">{message}</p>}
    {canManage && !location.id && <form className="tournament-create" onSubmit={(event) => void create(event)}>
      <h2>Панель учителя / администратора</h2>
      <p>Создай событие и настрой формат, контроль времени, инкремент и лимит участников.</p>
      <label>Название<input name="name" required minLength={3} maxLength={80} placeholder="Весенний турнир" /></label>
      <label>Описание<textarea name="description" maxLength={2000} rows={3} placeholder="Правила и дополнительная информация" /></label>
      <label>Приз победителю<input name="prize" maxLength={160} defaultValue="500 монет и медаль чемпиона" required /></label>
      <div className="tournament-form-grid">
        <label>Формат<select name="format" defaultValue="round_robin"><option value="round_robin">Круговой</option><option value="swiss">Швейцарская система</option><option value="single_elimination">На выбывание</option></select></label>
        <label>Время, секунд<input name="time_control" type="number" min={30} max={7200} defaultValue={300} required /></label>
        <label>Инкремент, секунд<input name="increment" type="number" min={0} max={60} defaultValue={0} required /></label>
        <label>Максимум игроков<input name="max_players" type="number" min={2} max={128} defaultValue={32} required /></label>
        <label>Длительность, часов<input name="duration_hours" type="number" min={1} max={2160} defaultValue={168} required /></label>
      </div>
      <button className="button button-primary" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Создать турнир'}</button>
    </form>}
    <div className="tournament-list">
      {shownTournaments.map((tournament) => {
        const isFull = tournament.participants.length >= tournament.max_players;
        const ownParticipant = tournament.participants.find((participant) => participant.user_id === user?.id);
        return <article className="tournament-card race-event-card" key={tournament.id}>
          <div className="tournament-card-heading">
            <div><span className="profile-card-kicker">{formatLabels[tournament.format]}</span><h2>{location.id ? 'Участники и условия' : <a href={tournamentHref(tournament.id)}>{tournament.name} ↗</a>}</h2></div>
            <strong>{tournamentStatus(tournament.status)}</strong>
          </div>
          {tournament.description && <p>{tournament.description}</p>}
          <div className="race-event-facts"><span><b>{tournament.participants.length}<small> / {tournament.max_players}</small></b>участников</span><span><b>{Math.floor(tournament.time_control / 60)}+{tournament.increment}</b>минут + секунд за ход</span><span><b>{ownParticipant ? 'Ты в игре' : isFull ? 'Все в сборе' : tournament.status === 'registration' ? 'Присоединяйся' : 'Набор закрыт'}</b>{ownParticipant ? 'Твоё место выделено ниже' : isFull ? 'Свободных мест нет' : 'Соревнуйся с учениками школы'}</span></div>
          <div className="tournament-incentive"><span className="tournament-prize"><small>ПРИЗ ОТ ОРГАНИЗАТОРА</small><strong>🏆 {tournament.prize}</strong><small>Выдаётся после объявления итогов</small></span><TournamentCountdown endsAt={tournament.ends_at} /></div>
          <details className="race-rules"><summary>Как определяется победитель?</summary><p>{winnerRules[tournament.format]}</p><p>Таблица ниже сравнивает текущий ELO участников. Это не турнирные очки. Итоги по результатам партий объявляет организатор.</p></details>
          {!user && <p><a href="#auth">Войдите</a>, чтобы записаться на турнир.</p>}
          {user && !ownParticipant && <button className="button button-primary" disabled={busy || isFull || tournament.status !== 'registration'} type="button" onClick={() => void runAction(() => tournamentsApi.joinTournament(tournament.id), 'Вы записаны на турнир.')}>{tournament.status !== 'registration' ? 'Регистрация закрыта' : isFull ? 'Мест больше нет' : 'Записаться'}</button>}
          {ownParticipant && <div className="tournament-side-picker"><span>Выбери сторону:</span>{(['white', 'black', 'random'] as const).map((color) => <button className={ownParticipant.preferred_color === color ? 'selected' : ''} aria-pressed={ownParticipant.preferred_color === color} key={color} disabled={busy} type="button" onClick={() => void runAction(() => tournamentsApi.chooseSide(tournament.id, color), `Выбрана сторона: ${colorLabels[color]}.`)}>{colorLabels[color]}</button>)}</div>}
          {canManage && !isFull && <div className="tournament-manage-row">
            <select aria-label={`Добавить игрока в турнир ${tournament.name}`} value={selectedPlayers[tournament.id] ?? ''} onChange={(event) => setSelectedPlayers((state) => ({ ...state, [tournament.id]: event.target.value }))}>
              <option value="">Выбрать игрока для добавления</option>
              {players.filter((player) => !tournament.participants.some((participant) => participant.user_id === player.id)).map((player) => <option key={player.id} value={player.id}>{player.display_name} · {player.elo_rating}</option>)}
            </select>
            <button className="button button-link" type="button" disabled={busy || !selectedPlayers[tournament.id]} onClick={() => void runAction(() => tournamentsApi.joinTournament(tournament.id, selectedPlayers[tournament.id]), 'Игрок добавлен в турнир.')}>Добавить игрока</button>
          </div>}
          <RaceStandings tournament={tournament} userId={user?.id} initialPlayerId={location.playerId || undefined} renderActions={canManage ? (participant) => <div className="tournament-player-actions">
                <input aria-label={`Группа игрока ${participant.display_name}`} value={groups[participant.user_id] ?? participant.group_name ?? ''} maxLength={24} placeholder="Группа" onChange={(event) => setGroups((state) => ({ ...state, [participant.user_id]: event.target.value }))} />
                <button className="button button-link" type="button" disabled={busy} onClick={() => void runAction(() => tournamentsApi.assignGroup(tournament.id, participant.user_id, groups[participant.user_id]?.trim() || null), 'Распределение обновлено.')}>Назначить</button>
                <button className="button button-link" type="button" disabled={busy} onClick={() => void runAction(() => tournamentsApi.removeParticipant(tournament.id, participant.user_id), 'Участник удалён.')}>Убрать</button>
              </div> : undefined} />
        </article>;
      })}
      {loading && <p className="tournament-empty" role="status">Загружаем события…</p>}
      {!loading && !shownTournaments.length && !error && <p className="tournament-empty">{location.id ? 'Событие не найдено. Вернись ко всем событиям и выбери другое.' : 'Турниров пока нет.'}</p>}
    </div>
  </section>;
}
