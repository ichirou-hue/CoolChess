import './PlayerAvatar.css';

export function PlayerAvatar({ name, bot = false }: { name: string; bot?: boolean }) {
  return <span className={`game-player-avatar ${bot ? 'is-bot' : 'is-user'}`} aria-hidden="true">
    {bot ? <svg viewBox="0 0 32 32" fill="none" focusable="false">
      <path d="M16 5v4M5 16H3v6h3m21-6h2v6h-3" stroke="#eafe91" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="4" r="2" fill="#eafe5f" />
      <rect x="6" y="9" width="20" height="17" rx="6" fill="#eafe91" />
      <rect x="10" y="14" width="4" height="5" rx="2" fill="#4543c5" />
      <rect x="18" y="14" width="4" height="5" rx="2" fill="#4543c5" />
      <path d="M13 22c1.5 1 4.5 1 6 0" stroke="#4543c5" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m25 5 1-2 1 2 2 1-2 1-1 2-1-2-2-1Z" fill="#fff" opacity=".85" />
    </svg> : <span className="game-player-initial">{Array.from(name.trim())[0]?.toLocaleUpperCase('ru') || 'У'}</span>}
  </span>;
}
