import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/model/AuthProvider';
import * as tournamentsApi from '../api/tournamentsApi';
import type { Tournament, TournamentColor } from '../api/tournamentsApi';

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
    });
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
      });
      formElement.reset();
    }, 'Турнир создан.');
  };

  return <section className="tournaments-page">
    <header className="tournaments-heading">
      <span className="eyebrow"><span>08</span> СОБЫТИЯ COOLCHESS</span>
      <h1>Турниры<br /><em>и команды.</em></h1>
      <p>Записывайся на турнир, выбирай сторону, а учителя могут распределять участников по группам.</p>
    </header>
    {error && <p className="puzzle-reward" role="alert">{error}</p>}
    {message && <p className="tournament-status" role="status">{message}</p>}
    {canManage && <form className="tournament-create" onSubmit={(event) => void create(event)}>
      <h2>Панель учителя / администратора</h2>
      <p>Создай событие и настрой формат, контроль времени, инкремент и лимит участников.</p>
      <label>Название<input name="name" required minLength={3} maxLength={80} placeholder="Весенний турнир" /></label>
      <label>Описание<textarea name="description" maxLength={2000} rows={3} placeholder="Правила и дополнительная информация" /></label>
      <div className="tournament-form-grid">
        <label>Формат<select name="format" defaultValue="round_robin"><option value="round_robin">Круговой</option><option value="swiss">Швейцарская система</option><option value="single_elimination">На выбывание</option></select></label>
        <label>Время, секунд<input name="time_control" type="number" min={30} max={7200} defaultValue={300} required /></label>
        <label>Инкремент, секунд<input name="increment" type="number" min={0} max={60} defaultValue={0} required /></label>
        <label>Максимум игроков<input name="max_players" type="number" min={2} max={128} defaultValue={32} required /></label>
      </div>
      <button className="button button-primary" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Создать турнир'}</button>
    </form>}
    <div className="tournament-list">
      {tournaments.map((tournament) => {
        const isFull = tournament.participants.length >= tournament.max_players;
        const ownParticipant = tournament.participants.find((participant) => participant.user_id === user?.id);
        return <article className="tournament-card" key={tournament.id}>
          <div className="tournament-card-heading">
            <div><span className="profile-card-kicker">{formatLabels[tournament.format]}</span><h2>{tournament.name}</h2></div>
            <strong>{tournament.participants.length}/{tournament.max_players}</strong>
          </div>
          {tournament.description && <p>{tournament.description}</p>}
          <p className="tournament-settings">{Math.floor(tournament.time_control / 60)}+{tournament.increment} · {tournament.status === 'registration' ? 'Идёт регистрация' : tournament.status}</p>
          {!user && <p><a href="#auth">Войдите</a>, чтобы записаться на турнир.</p>}
          {user && !ownParticipant && <button className="button button-primary" disabled={busy || isFull} type="button" onClick={() => void runAction(() => tournamentsApi.joinTournament(tournament.id), 'Вы записаны на турнир.')}>Записаться</button>}
          {ownParticipant && <div className="tournament-side-picker"><span>Выбери сторону:</span>{(['white', 'black', 'random'] as const).map((color) => <button className={ownParticipant.preferred_color === color ? 'selected' : ''} key={color} disabled={busy} type="button" onClick={() => void runAction(() => tournamentsApi.chooseSide(tournament.id, color), `Выбрана сторона: ${colorLabels[color]}.`)}>{colorLabels[color]}</button>)}</div>}
          {canManage && !isFull && <div className="tournament-manage-row">
            <select aria-label={`Добавить игрока в турнир ${tournament.name}`} value={selectedPlayers[tournament.id] ?? ''} onChange={(event) => setSelectedPlayers((state) => ({ ...state, [tournament.id]: event.target.value }))}>
              <option value="">Выбрать игрока для добавления</option>
              {players.filter((player) => !tournament.participants.some((participant) => participant.user_id === player.id)).map((player) => <option key={player.id} value={player.id}>{player.display_name} · {player.elo_rating}</option>)}
            </select>
            <button className="button button-link" type="button" disabled={busy || !selectedPlayers[tournament.id]} onClick={() => void runAction(() => tournamentsApi.joinTournament(tournament.id, selectedPlayers[tournament.id]), 'Игрок добавлен в турнир.')}>Добавить игрока</button>
          </div>}
          <ul className="tournament-participants">
            {tournament.participants.map((participant) => <li key={participant.user_id}>
              <span><strong>{participant.display_name}</strong><small>{participant.elo_rating} ELO{participant.group_name ? ` · Группа ${participant.group_name}` : ''}{participant.preferred_color ? ` · ${colorLabels[participant.preferred_color]}` : ''}</small></span>
              {canManage && <div className="tournament-player-actions">
                <input aria-label={`Группа игрока ${participant.display_name}`} value={groups[participant.user_id] ?? participant.group_name ?? ''} maxLength={24} placeholder="Группа" onChange={(event) => setGroups((state) => ({ ...state, [participant.user_id]: event.target.value }))} />
                <button className="button button-link" type="button" disabled={busy} onClick={() => void runAction(() => tournamentsApi.assignGroup(tournament.id, participant.user_id, groups[participant.user_id]?.trim() || null), 'Распределение обновлено.')}>Назначить</button>
                <button className="button button-link" type="button" disabled={busy} onClick={() => void runAction(() => tournamentsApi.removeParticipant(tournament.id, participant.user_id), 'Участник удалён.')}>Убрать</button>
              </div>}
            </li>)}
          </ul>
        </article>;
      })}
      {!tournaments.length && !error && <p className="tournament-empty">Турниров пока нет.</p>}
    </div>
  </section>;
}
