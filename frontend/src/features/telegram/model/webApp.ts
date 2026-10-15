/** Типы и доступ к Telegram WebApp (Mini App), по подходу ChessNowBot:
 * объект window.Telegram.WebApp, colorScheme/themeParams, событие themeChanged.
 * Вне Telegram-клиента все хелперы возвращают null/'' — сайт работает как обычно.
 */

export type TelegramColorScheme = 'light' | 'dark';

export type TelegramThemeParams = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; username?: string } };
  colorScheme: TelegramColorScheme;
  themeParams: TelegramThemeParams;
  viewportHeight: number;
  isExpanded: boolean;
  ready: () => void;
  expand: () => void;
  onEvent: (event: 'themeChanged' | 'viewportChanged', handler: () => void) => void;
  offEvent: (event: 'themeChanged' | 'viewportChanged', handler: () => void) => void;
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  const webApp = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return webApp ?? null;
}

/** Непустой initData — признак открытия именно внутри Telegram-клиента. */
export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

export function isTelegramMiniApp(): boolean {
  return getTelegramInitData().length > 0;
}
