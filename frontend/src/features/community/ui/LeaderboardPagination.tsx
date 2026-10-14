import './LeaderboardPagination.css';

export const leaderboardPageSize = 50;

export function LeaderboardPagination({ page, total, loading, onChange }: {
  page: number;
  total: number;
  loading: boolean;
  onChange: (page: number) => void;
}) {
  if (total <= 0) return null;
  const count = Math.ceil(total / leaderboardPageSize);
  const pages = [...new Set([1, page - 1, page, page + 1, count])]
    .filter(value => value >= 1 && value <= count).sort((a, b) => a - b);
  const from = (page - 1) * leaderboardPageSize + 1;
  const to = Math.min(page * leaderboardPageSize, total);
  return <div className="leaderboard-pagination">
    <p className="leaderboard-page-summary" role="status">{loading ? `Загружаем страницу ${page}…` : `Игроки ${from}–${to} из ${total}`}</p>
    {count > 1 && <nav className="leaderboard-page-controls" aria-label="Страницы рейтинга">
      <button type="button" disabled={loading || page === 1} onClick={() => onChange(page - 1)} aria-label="Предыдущая страница рейтинга">← Назад</button>
      <span className="leaderboard-page-numbers">{pages.map((value, index) => <span className="leaderboard-page-slot" key={value}>
        {index > 0 && value > pages[index - 1] + 1 && <span className="leaderboard-page-gap" aria-hidden="true">…</span>}
        <button type="button" aria-label={`Страница ${value}`} aria-current={value === page ? 'page' : undefined} disabled={loading || value === page} onClick={() => onChange(value)}>{value}</button>
      </span>)}</span>
      <button type="button" disabled={loading || page === count} onClick={() => onChange(page + 1)} aria-label="Следующая страница рейтинга">Далее →</button>
    </nav>}
  </div>;
}
