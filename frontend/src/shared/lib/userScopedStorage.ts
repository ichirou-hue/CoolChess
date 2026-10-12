/** Привязка браузерных хранилищ прогресса к текущему пользователю.
 *
 * Прогресс теории/квизов/практики лежал в глобальных localStorage-ключах,
 * поэтому новый аккаунт в том же браузере видел чужие «зелёные» темы.
 * Теперь каждый ключ суффиксуется id пользователя; без входа — `anonymous`.
 * Старое общее значение один раз переезжает текущему владельцу, чтобы
 * обновление не сжигало пешки и streaks.
 */

const OWNER_KEY = 'coolchess.storage.owner.v1';
const ANONYMOUS_OWNER = 'anonymous';

const LEGACY_BASE_KEYS = [
  'coolchess.studentState',
  'coolchess.quiz.v1',
  'coolchess.quiz.answers.v1',
  'coolchess.practice.v1',
  'coolchess.demo.v1',
  'coolchess.coursePlacement.v1',
  'coolchess.maiaAchievements.v1',
];

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStorageOwner(): string {
  return storage()?.getItem(OWNER_KEY) ?? ANONYMOUS_OWNER;
}

export function scopedKey(base: string): string {
  return `${base}.${getStorageOwner()}`;
}

/** Запоминает владельца хранилищ; вызывается из AuthProvider при смене юзера. */
export function setStorageOwner(userId: string | null): void {
  const store = storage();
  if (!store) return;
  const owner = userId ?? ANONYMOUS_OWNER;
  try {
    if (userId) store.setItem(OWNER_KEY, userId);
    else store.removeItem(OWNER_KEY);
  } catch {
    return;
  }
  adoptLegacyKeys(store, owner);
}

function adoptLegacyKeys(store: Storage, owner: string): void {
  try {
    for (const base of LEGACY_BASE_KEYS) {
      const scoped = `${base}.${owner}`;
      if (store.getItem(scoped) !== null) continue;
      const legacy = store.getItem(base);
      if (legacy === null) continue;
      store.setItem(scoped, legacy);
      // Общее значение отдаём только реальному пользователю: анонимный
      // ключ живёт дальше, чтобы следующий вход мог его забрать.
      if (owner !== ANONYMOUS_OWNER) store.removeItem(base);
    }
  } catch {
    // Битое хранилище — новый аккаунт просто начнёт с чистого прогресса.
  }
}
