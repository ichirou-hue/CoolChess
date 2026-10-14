import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 600, height: 960 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 844, height: 390 }, // Phone in landscape.
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
];
const routes = ['home', 'pvp', 'play', 'puzzles', 'learn', 'learn/basics-history', 'community', 'profile', 'tournaments', 'auth'];
const longName = 'ОченьДлинноеИмяШахматиста';
const puzzle = { id: 'layout-puzzle', fen: '8/8/8/8/8/2k5/8/K7 w - - 0 1', initial_move: '', rating: 800, popularity: 0, themes: ['endgame'], game_url: null };
const tournament = {
  id: 'layout-tournament', name: 'Большой шахматный турнир для начинающих игроков',
  description: 'Играй с друзьями и решай шахматные задачи каждый день.',
  format: 'swiss', time_control: 180, increment: 2, max_players: 100, status: 'open',
  ends_at: '2099-01-01T12:00:00Z', prize: 'Награда самому активному участнику',
  created_at: '2026-01-01T12:00:00Z', is_joined: false,
  participants: [{ user_id: 'layout-player', display_name: longName, elo_rating: 1200, group_name: null, preferred_color: null, joined_at: '2026-01-01T12:00:00Z' }],
};

test.beforeEach(async ({ page }) => {
  // Deterministic layout fixtures: no backend or Google Fonts connection needed.
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
  await page.route(/^https?:\/\/[^/]+\/api\//, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tournaments') return route.fulfill({ json: [tournament] });
    if (path === '/api/leaderboard') return route.fulfill({ json: {
      category: 'elo', total_players: 1, my_rank: null,
      top_players: [{ rank: 1, user_id: 'layout-player', display_name: longName, email: 'layout@example.test', elo_rating: 1200, level: 1, xp: 0, puzzles_solved: 0 }],
    } });
    if (path === '/api/puzzles/random') return route.fulfill({ json: puzzle });
    if (path === '/api/puzzles/batch') return route.fulfill({ json: [puzzle] });
    // Exercise error copy on unsupported endpoints instead of contacting a database.
    return route.fulfill({ status: 503, json: { detail: 'Сервис временно недоступен. Попробуй ещё раз позже.' } });
  });
});

async function open(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await expect(page.locator('main').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (route === 'community') await expect(page.locator('.ranking-row')).toBeVisible();
  if (route === 'tournaments') await expect(page.locator('.tournament-card')).toBeVisible();
  if (route === 'puzzles') await expect(page.locator('.puzzle-board cg-board')).toBeVisible();
}

async function expectContained(page: Page) {
  const issues = await page.evaluate(() => {
    const selectors = '.topbar .brand, .topbar-user, .topbar button, .topbar a, main h1, main h2, main h3, main p, main input, main select, main textarea, main button, main a, .pvp-board-card, .game-layout, .puzzle-board, .learn-article, .community-hero-side, .community-hero-events, .ranking-row, .journey-card, .auth-form-panel';
    return [...document.querySelectorAll<HTMLElement>(selectors)].filter(el => {
      if (!el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') return false;
      // Tabs and the course catalog can scroll within their own bounded container.
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth + 1) return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
    }).map(el => `${el.tagName}.${el.className}: ${el.textContent?.slice(0, 70)}`);
  });
  expect(issues, 'Text, controls and panels must stay within the viewport').toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  const collisions = await page.evaluate(() => {
    const groups = [
      ['.brand', '.topbar-user', '.menu-button'],
      ['.game-intro', '.game-layout', '.move-panel'],
      ['.game-intro', '.material-balance-rail'],
    ];
    const issues: string[] = [];
    for (const selectors of groups) {
      const elements = selectors.map(selector => document.querySelector<HTMLElement>(selector)).filter((el): el is HTMLElement => Boolean(el?.getClientRects().length));
      for (let i = 0; i < elements.length; i++) for (let j = i + 1; j < elements.length; j++) {
        const a = elements[i].getBoundingClientRect();
        const b = elements[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push(`${elements[i].className} overlaps ${elements[j].className}`);
      }
    }
    return issues;
  });
  expect(collisions, 'Adjacent controls and game panels must not overlap').toEqual([]);
  for (const board of await page.locator('.coordinate-board-surface, .game-coordinate-board').all()) {
    const box = await board.boundingBox();
    if (box && box.width > 0) expect(Math.abs(box.width - box.height), 'Chessboard squares must keep their proportions').toBeLessThan(2);
  }
}

for (const viewport of viewports) {
  test(`public screens fit ${viewport.width}×${viewport.height} with fallback fonts`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await test.step(route, async () => {
        await open(page, route);
        await expectContained(page);
        if (route === 'pvp') {
          const copy = await page.locator('.pvp-auth-card p').boundingBox();
          const cta = await page.locator('.pvp-auth-card .button').boundingBox();
          expect(cta!.y - copy!.y - copy!.height).toBeGreaterThanOrEqual(16);
        }
      });
    }
  });
}

for (const viewport of [viewports[0], viewports[3], viewports[6], viewports[8]]) {
  test(`PvP lobby and menu work at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => sessionStorage.setItem('coolchess.accessToken', 'layout-test-token'));
    await page.route('http://127.0.0.1:4173/api/users/me', route => route.fulfill({ json: {
      id: 'layout-player', email: 'layout@example.test', display_name: longName, role: 'student', is_superuser: false, elo_rating: 1200,
    } }));
    await open(page, 'pvp');
    await expect(page.locator('.pvp-panel')).toBeVisible();
    await expect(page.locator('.pvp-board-card cg-board')).toBeVisible();
    await expectContained(page);
    await page.getByRole('textbox', { name: 'Код комнаты' }).fill('A7K4Q');
    await expect(page.getByRole('button', { name: 'Подключиться', exact: true })).toBeEnabled();
    for (const control of await page.locator('.pvp-actions button').all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(47.99);
    }
    const menu = page.locator('.menu-button');
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expectContained(page);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
    await menu.click();
    await page.locator('#main-navigation').getByRole('link', { name: 'Главная: Маршрут по сайту' }).click();
    await expect(page.locator('.home-journey')).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
}

test('PvP copy reflows with large text and a long message', async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await open(page, 'pvp');
  await page.locator('.pvp-auth-card p').evaluate(el => {
    el.textContent = 'Войди в аккаунт, чтобы создать комнату и пригласить друга. '.repeat(5);
    el.style.fontSize = '24px';
  });
  await expectContained(page);
  const copy = await page.locator('.pvp-auth-card p').boundingBox();
  const cta = await page.locator('.pvp-auth-card .button').boundingBox();
  expect(cta!.y).toBeGreaterThan(copy!.y + copy!.height);
  await page.locator('.pvp-auth-card .button').click();
  await expect(page.locator('.auth-page')).toBeVisible();
});

test('phone registration and navigation remain usable with a saved dark preference', async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await page.addInitScript(() => localStorage.setItem('coolchess.theme', 'dark'));
  await open(page, 'auth');
  await page.getByRole('button', { name: 'Регистрация', exact: true }).click();
  await expectContained(page);
  for (const field of await page.locator('input:not([type="checkbox"])').all()) {
    expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  }
  await open(page, 'home');
  await expect(page.getByRole('switch')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await expectContained(page);
  await page.locator('#main-navigation').getByRole('link', { name: 'PvP: Партия с другом' }).click();
  await expect(page.locator('.pvp-auth-card')).toBeVisible();
  await expectContained(page);
});

test('layout responds when a tablet rotates without reloading', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await open(page, 'learn/basics-history');
  await expectContained(page);
  await page.setViewportSize({ width: 1180, height: 820 });
  await expectContained(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectContained(page);
});

test('game history stays visible, scrolls and aligns with the board after resizing', async ({ page, browserName }) => {
  await page.addInitScript(() => sessionStorage.setItem('coolchess.accessToken', 'layout-test-token'));
  await page.route('**/api/users/me', route => route.fulfill({ json: {
    id: 'layout-player', email: 'layout@example.test', display_name: longName, role: 'student', is_superuser: false, elo_rating: 1200,
  } }));
  await page.route('**/api/games/active', route => route.fulfill({ json: {
    id: 'history-game', status: 'in_progress', player_color: 'white', bot_difficulty: 1500,
    current_fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 60 31',
    moves_uci: Array.from({ length: 15 }, () => ['g1f3', 'g8f6', 'f3g1', 'f6g8']).flat(),
    is_check: false, is_game_over: false, winner: null, last_bot_move: 'f6g8', xp_earned: 0, coins_earned: 0, elo_delta: 0,
  } }));
  await open(page, 'play');
  const history = page.locator('.move-columns');
  await expect(history.locator('button')).toHaveCount(60);
  for (const width of [390, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await history.boundingBox())!.height).toBeGreaterThan(120);
    await expectContained(page);
    expect(await history.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect.poll(() => history.evaluate(el => {
      const active = el.querySelector('.move-column button.active')!.getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      return Math.max(bounds.top - active.top, active.bottom - bounds.bottom);
    })).toBeLessThanOrEqual(1);
    if (width >= 1280) await expect.poll(async () => {
      const board = (await page.locator('.game-layout .coordinate-board-surface').boundingBox())!;
      const panel = (await page.locator('.move-panel').boundingBox())!;
      return Math.max(Math.abs(board.y - panel.y), Math.abs(board.height - panel.height));
    }).toBeLessThan(1);
    if (browserName === 'chromium' && width === 1440) await page.locator('.game-section').screenshot({ path: '../.tools/game-history-1440.png' });
  }
  await page.locator('.user-move-column button').first().click();
  await expect(page.locator('.user-row')).toContainText('просмотр 1/60');
  await page.getByRole('button', { name: 'К текущей позиции' }).click();
  await expect(page.locator('.user-row')).not.toContainText('просмотр');
});

test.describe('touchscreen', () => {
  test.use({ hasTouch: true, deviceScaleFactor: 3, viewport: { width: 390, height: 844 } });
  test('menu and chess moves support taps', async ({ page }) => {
    await open(page, 'home');
    await page.locator('.menu-button').tap();
    await page.locator('#main-navigation').getByRole('link', { name: 'Задачи: Тактика и прогресс' }).tap();
    await expect(page.locator('.puzzle-board cg-board')).toBeVisible();
    await expectContained(page);
    const board = page.locator('.puzzle-board cg-board');
    await board.scrollIntoViewIfNeeded();
    await expect(board.locator('piece.white.king')).toBeVisible();
    // Chessground refreshes pointer bounds on the frame after scrolling.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const bounds = (await board.boundingBox())!;
    await board.tap({ position: { x: bounds.width / 16, y: bounds.height * 15 / 16 } });
    await expect(board.locator('square.selected')).toBeVisible();
    const submitted = page.waitForRequest(request => new URL(request.url()).pathname === '/api/puzzles/layout-puzzle/solve');
    await board.tap({ position: { x: bounds.width * 3 / 16, y: bounds.height * 15 / 16 } });
    expect((await submitted).postDataJSON().user_moves).toBe('a1b1');
  });
});
