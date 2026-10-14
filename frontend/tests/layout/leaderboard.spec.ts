import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`all 142 players are available in pages of 50 at ${width}px`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height: 960 });
    await page.addInitScript(() => sessionStorage.setItem('coolchess.accessToken', 'leaderboard-test'));
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
    await page.route(/^https?:\/\/[^/]+\/api\//, route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/users/me') return route.fulfill({ json: { id: 'player-120', display_name: 'Игрок 120', email: 'player120@example.test', role: 'student', is_superuser: false, elo_rating: 1200 } });
      if (url.pathname === '/api/tournaments') return route.fulfill({ json: [] });
      if (url.pathname === '/api/leaderboard') {
        const offset = Number(url.searchParams.get('offset'));
        expect(url.searchParams.get('limit')).toBe('50');
        const category = url.searchParams.get('category');
        const players = Array.from({ length: 142 }, (_, index) => ({
          rank: index + 1, user_id: `player-${index + 1}`, display_name: `Игрок ${index + 1}`, email: 'p***@example.test',
          elo_rating: 2500 - index, level: 100 - Math.floor(index / 2), xp: 10000 - index, puzzles_solved: 500 - index,
        }));
        return route.fulfill({ json: { category, total_players: 142, top_players: players.slice(offset, offset + 50), my_rank: { ...players[119], rank: 120 } } });
      }
      return route.fulfill({ status: 503, json: { detail: 'Layout fixture' } });
    });
    await page.goto('/#community');
    const board = page.locator('#community-ranking');
    const rows = board.locator('.ranking-row');
    const controls = board.getByRole('navigation', { name: 'Страницы рейтинга' });
    await expect(rows).toHaveCount(50);
    await expect(board.getByRole('status')).toHaveText('Игроки 1–50 из 142');
    await expect(controls.getByRole('button', { name: 'Предыдущая страница рейтинга' })).toBeDisabled();
    await controls.getByRole('button', { name: 'Следующая страница рейтинга' }).click();
    await expect(board.getByRole('status')).toHaveText('Игроки 51–100 из 142');
    await expect(rows).toHaveCount(50);
    await expect(rows.first().locator('.ranking-place')).toHaveAttribute('aria-label', '51 место');
    await expect(rows.last().locator('.ranking-place')).toHaveAttribute('aria-label', '100 место');
    await controls.getByRole('button', { name: 'Страница 3', exact: true }).click();
    await expect(board.getByRole('status')).toHaveText('Игроки 101–142 из 142');
    await expect(rows).toHaveCount(42);
    await expect(rows.last().locator('.ranking-place')).toHaveAttribute('aria-label', '142 место');
    await expect(rows.filter({ hasText: 'Игрок 120' })).toHaveClass(/current/);
    await expect(controls.getByRole('button', { name: 'Следующая страница рейтинга' })).toBeDisabled();
    await expect(page.locator('.online-card')).toContainText('#120');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (browserName === 'chromium') await board.screenshot({ path: `../.tools/leaderboard-page3-${width}.png` });
    for (const name of ['Уровень', 'Задачи', 'ELO']) {
      await board.getByRole('button', { name, exact: true }).click();
      await expect(board.getByRole('status')).toHaveText('Игроки 1–50 из 142');
      await expect(controls.getByRole('button', { name: 'Страница 1', exact: true })).toHaveAttribute('aria-current', 'page');
      await controls.getByRole('button', { name: 'Страница 3', exact: true }).click();
      await expect(rows).toHaveCount(42);
    }
    await controls.getByRole('button', { name: 'Предыдущая страница рейтинга' }).click();
    await expect(board.getByRole('status')).toHaveText('Игроки 51–100 из 142');
  });
}
