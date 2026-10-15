/** Провайдер темы Telegram WebApp (аналог TelegramThemeProvider из ChessNowBot).
 *
 * При монтировании: WebApp.ready() + WebApp.expand() + setHeaderColor + isVerticalSwipesEnabled,
 * начальные CSS-переменные из themeParams; подписка на themeChanged/viewportChanged обновляет их живьёл.
 * Вне Telegram — прозрачный passthrough, сайт выглядит как обычно.
 */
import { useEffect, type ReactNode } from 'react';
import { getTelegramWebApp } from '../model/webApp';

function applyTelegramTheme() {
  const webApp = getTelegramWebApp();
  const root = document.documentElement;
  const body = document.body;
  if (!webApp) {
    root.removeAttribute('data-tg-theme');
    root.classList.remove('is-telegram');
    body.classList.remove('is-telegram');
    return;
  }
  // Класс для селекторов, отличных для TMA — вешаем и на html, и на body
  root.classList.add('is-telegram');
  body.classList.add('is-telegram');
  // === НОВОЕ: метка окружения ===
  // (already added above)

  // === НОВОЕ: цвет фона хедера Telegram ===
  try {
    webApp.setHeaderColor(webApp.themeParams?.header_bg_color ?? '#ffffff');
  } catch {
    // ignore
  }

  // === НОВОЕ: запрет vertical swipes (чтобы не ломать drag&drop фигур) ===
  try {
    webApp.isVerticalSwipesEnabled = false;
  } catch {
    // ignore
  }

  root.setAttribute('data-tg-theme', webApp.colorScheme);
  const params = webApp.themeParams ?? {};
  const mapping: Record<string, string | undefined> = {
    '--tg-bg': params.bg_color,
    '--tg-text': params.text_color,
    '--tg-hint': params.hint_color,
    '--tg-link': params.link_color,
    '--tg-button': params.button_color,
    '--tg-button-text': params.button_text_color,
    '--tg-secondary-bg': params.secondary_bg_color,
    '--tg-header-bg': params.header_bg_color,
  };
  for (const [variable, value] of Object.entries(mapping)) {
    if (value) root.style.setProperty(variable, value);
    else root.style.removeProperty(variable);
  }
  root.style.setProperty('--tg-viewport-height', `${webApp.viewportHeight || window.innerHeight}px`);
}

export function TelegramProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    try {
      webApp.ready();
      webApp.expand();
    } catch {
      // Старые клиенты могут не поддерживать expand — не критично.
    }
    applyTelegramTheme();
    const handler = () => applyTelegramTheme();
    webApp.onEvent('themeChanged', handler);
    webApp.onEvent('viewportChanged', handler);
    return () => {
      webApp.offEvent('themeChanged', handler);
      webApp.offEvent('viewportChanged', handler);
    };
  }, []);

  return <>{children}</>;
}
