import { useEffect, useState } from 'react';

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0
    ? `${days} дн. ${String(hours).padStart(2, '0')} ч ${String(minutes).padStart(2, '0')} мин`
    : `${String(hours).padStart(2, '0')} ч ${String(minutes).padStart(2, '0')} мин ${String(seconds).padStart(2, '0')} сек`;
}

export function TournamentCountdown({ endsAt, compact = false }: { endsAt: string; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), compact ? 60_000 : 1000);
    return () => window.clearInterval(timer);
  }, [compact]);

  const remaining = Date.parse(endsAt) - now;
  return <span className={`tournament-countdown${compact ? ' compact' : ''}`} aria-live="off">
    <small>{remaining > 0 ? 'До итогов' : 'Турнир завершён'}</small>
    <strong>{remaining > 0 ? formatRemaining(remaining) : 'Ожидайте результаты'}</strong>
  </span>;
}
