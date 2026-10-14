import { expect, test, type Page } from '@playwright/test';
import type { TournamentColor } from '../../src/features/community/api/tournamentsApi';

const players = [
  ['me', 'ОченьДлинноеИмяШахматиста', 1000],
  ['leader', 'Алиса', 1800],
  ['second', 'Борис', 1700],
  ['tie', 'Вера', 1700],
  ['fourth', 'Глеб', 1600],
  ['fifth', 'Даша', 1500],
  ['sixth', 'Егор', 1400],
  ['seventh', 'Женя', 1300],
].map(([user_id, display_name, elo_rating], index) => ({
  user_id, display_name, elo_rating, group_name: index % 2 ? 'А' : 'Б', preferred_color: null as TournamentColor | null,
  joined_at: `2026-01-0${index + 1}T12:00:00Z`,
}));
const race = {
  id: 'weekly-race', name: 'Недельный спринт (Лига новичков)',
  description: 'Сыграй несколько партий и поднимись в рейтинге.',
  format: 'round_robin', time_control: 300, increment: 3, max_players: 32,
  status: 'registration', ends_at: '2099-01-01T12:00:00Z',
  prize: '500 монет и медаль чемпиона', created_at: '2026-01-01T12:00:00Z',
  is_joined: true, participants: players,
};

async function fixtures(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('coolchess.accessToken', 'race-test-token'));
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await page.route(/^https?:\/\/[^/]+\/api\//, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/users/me') return route.fulfill({ json: { id: 'me', display_name: players[0].display_name, email: 'race@example.test', role: 'student', is_superuser: false, elo_rating: 1000 } });
    if (path === '/api/tournaments') return route.fulfill({ json: [race, { ...race, id: 'other', name: 'Другой турнир', participants: [] }] });
    if (path === '/api/leaderboard') return route.fulfill({ json: { total_players: 8, top_players: [], my_rank: null } });
    return route.fulfill({ status: 503, json: { detail: 'Недоступно в тесте' } });
  });
}

async function contained(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  for (const item of await page.locator('.race-marker, .race-table-player, .race-my-place, .race-search input').all()) {
    const box = await item.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
}

for (const width of [320, 390, 768, 1440]) {
  test(`race positions and personal navigation at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 960 });
    await fixtures(page);
    await page.goto('/#community');
    const markers = page.locator('.race-large .race-marker');
    await expect(markers).toHaveCount(4);
    await expect(markers.locator('.race-marker-place')).toHaveText(['#8', '#2', '#2', '#1']);
    const me = await markers.locator('.race-marker-avatar').first().boundingBox();
    const leader = await markers.locator('.race-marker-avatar').last().boundingBox();
    const finish = await page.locator('.race-large .race-course-finish').boundingBox();
    expect(me!.width).toBeGreaterThan(leader!.width);
    expect(me!.x + me!.width).toBeLessThan(leader!.x);
    expect(leader!.x + leader!.width).toBeLessThan(finish!.x);
    await contained(page);
    if (browserName === 'chromium') await page.locator('.race-large').screenshot({ path: `../.tools/race-community-${width}.png` });
    await markers.first().click();
    await expect(page).toHaveURL(/#tournaments\/weekly-race\/me$/);
    await expect(page.locator('.tournament-card')).toHaveCount(1);
    const table = page.getByRole('list', { name: 'Места участников по ELO' });
    await expect(table.locator('.race-table-row')).toHaveCount(8);
    await expect(table.locator('.race-table-place')).toHaveText(['♛#1', '#2', '#2', '#4', '#5', '#6', '#7', '#8']);
    await expect(page.locator('.race-player-focus')).toContainText('300 ELO до места #7');
    await contained(page);
    if (browserName === 'chromium') await page.locator('.race-event-card').screenshot({ path: `../.tools/race-detail-${width}.png` });
    await page.getByRole('searchbox').fill('Алиса');
    await expect(table.locator('li')).toHaveCount(1);
    await table.getByRole('button').click();
    await expect(page.locator('.race-player-focus')).toContainText('Лидер по рейтингу');
    await page.getByRole('searchbox').fill('Неизвестный');
    await expect(page.getByText('Такого игрока или группы нет.')).toBeVisible();
    await page.getByRole('button', { name: 'Моё место', exact: false }).click();
    await expect(page.getByRole('searchbox')).toHaveValue('');
    await expect(table.locator('.is-me > button')).toBeFocused();
    await expect(table.locator('.is-me > button')).toHaveAttribute('aria-pressed', 'true');
    await expect(table.locator('.is-me')).toContainText('До места #7 — 300 ELO');
    await page.getByText('Как определяется победитель?', { exact: true }).click();
    await expect(page.locator('.race-rules')).toHaveAttribute('open', '');
    await page.getByRole('link', { name: 'Все события', exact: false }).click();
    await expect(page.locator('.tournament-card')).toHaveCount(2);
    await page.locator('.tournament-card h2 a').last().click();
    await expect(page.locator('.tournament-card')).toHaveCount(1);
    await expect(page.getByText('На старте пока никого.', { exact: false })).toBeVisible();
  });
}

test('registration and side selection refresh the standings', async ({ page }) => {
  await fixtures(page);
  let current = { ...race, participants: players.slice(1), is_joined: false };
  await page.route('**/api/tournaments', route => route.fulfill({ json: [current] }));
  await page.route('**/api/tournaments/weekly-race/participants', route => {
    expect(route.request().method()).toBe('POST');
    current = { ...current, participants: players, is_joined: true };
    return route.fulfill({ json: current });
  });
  await page.route('**/api/tournaments/weekly-race/me/side', route => {
    expect(route.request().method()).toBe('PATCH');
    expect(route.request().postDataJSON()).toEqual({ preferred_color: 'white' });
    current = { ...current, participants: current.participants.map(player => player.user_id === 'me' ? { ...player, preferred_color: 'white' } : player) };
    return route.fulfill({ json: current });
  });
  await page.goto('/#tournaments/weekly-race');
  await page.getByRole('button', { name: 'Записаться', exact: true }).click();
  await expect(page.getByText('Вы записаны на турнир.', { exact: true })).toBeVisible();
  await expect(page.locator('.race-table-row.is-me')).toBeVisible();
  await page.getByRole('button', { name: 'Белые', exact: true }).click();
  await expect(page.getByText('Выбрана сторона: Белые.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Белые', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.race-table-row.is-me')).toContainText('Белые');
});

test('missing event shows an explicit recovery link', async ({ page }) => {
  await fixtures(page);
  await page.goto('/#tournaments/missing');
  await expect(page.getByText('Событие не найдено.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Все события', exact: false }).click();
  await expect(page.locator('.tournament-card')).toHaveCount(2);
});
