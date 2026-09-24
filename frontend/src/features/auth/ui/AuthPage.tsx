import { useState, type FormEvent } from 'react';
import { useAuth } from '../model/AuthProvider';

type AuthMode = 'login' | 'register';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>(() => window.location.hash.includes('/register') ? 'register' : 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const { login, register, error, clearError } = useAuth();
  const isRegister = mode === 'register';

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    clearError();
    window.history.replaceState(null, '', `#auth/${nextMode}`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    setPending(true);
    try {
      if (isRegister) await register(email, password);
      else await login(email, password);
      window.location.hash = '#home';
    } finally {
      setPending(false);
    }
  };

  return <main className="min-h-screen overflow-hidden bg-[#f7f7fb] text-[#111]">
    <div className="grid min-h-screen lg:grid-cols-[minmax(420px,0.78fr)_minmax(520px,1.22fr)]">
      <section className="relative hidden overflow-hidden bg-[#464bff] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-28 h-96 w-96 rounded-full bg-[#dce204] opacity-90 blur-[1px]" />
        <div className="absolute -bottom-44 -left-36 h-[520px] w-[520px] rounded-full border-[72px] border-white/10" />
        <a href="#home" className="relative z-10 inline-flex w-fit items-center" aria-label="На главную"><img src="/coolchess-logo.svg" alt="CoolChess" className="h-14 w-[280px] object-contain object-left brightness-0 invert" /></a>
        <div className="relative z-10 max-w-md"><span className="mb-5 inline-flex rounded-full bg-white/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em]">Шахматная школа</span><h1 className="text-6xl font-extrabold leading-[0.94] tracking-[-0.06em]">Твой ход<br /><span className="text-[#dce204]">к сильной игре.</span></h1><p className="mt-7 max-w-sm text-sm leading-7 text-white/75">Сохраняй прогресс, проходи темы и решай задачи каждый день.</p></div>
        <div className="relative z-10 flex gap-8 text-white/70"><span><b className="block text-2xl text-white">39</b><small className="text-[10px] uppercase tracking-wider">тем курса</small></span><span><b className="block text-2xl text-white">6 000</b><small className="text-[10px] uppercase tracking-wider">задач</small></span></div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-[470px]">
        <div className="mb-10 flex items-center justify-between lg:hidden"><a href="#home" aria-label="На главную"><img src="/coolchess-logo.svg" alt="CoolChess" className="h-12 w-[220px] object-contain object-left" /></a><span className="rounded-full bg-[#fffce7] px-3 py-2 text-[10px] font-bold text-[#464bff]">♟ ученик</span></div>
        <div className="mb-8"><span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#464bff]">{isRegister ? '01 · СОЗДАНИЕ ПРОФИЛЯ' : '01 · ВОЗВРАЩЕНИЕ В ИГРУ'}</span><h2 className="mt-4 text-4xl font-extrabold leading-none tracking-[-0.05em] sm:text-5xl">{isRegister ? <>Создай свой<br /><span className="text-[#464bff]">маршрут.</span></> : <>С возвращением<br /><span className="text-[#464bff]">в CoolChess.</span></>}</h2><p className="mt-5 text-sm leading-6 text-[#777985]">{isRegister ? 'Один аккаунт — теория, задачи, серия и рейтинг в одном месте.' : 'Войди, чтобы продолжить обучение.'}</p></div>
        <div className="mb-7 grid grid-cols-2 rounded-xl bg-[#ececf4] p-1"><button type="button" onClick={() => switchMode('login')} className={`rounded-lg px-4 py-3 text-xs font-bold transition ${!isRegister ? 'bg-white text-[#111] shadow-sm' : 'text-[#777985]'}`}>Войти</button><button type="button" onClick={() => switchMode('register')} className={`rounded-lg px-4 py-3 text-xs font-bold transition ${isRegister ? 'bg-white text-[#111] shadow-sm' : 'text-[#777985]'}`}>Регистрация</button></div>
        {error && <div className="mb-5 rounded-xl border border-[#f1b8b8] bg-[#fff0f0] px-4 py-3 text-xs font-semibold text-[#a32929]">{error}</div>}
        <form className="space-y-4" onSubmit={submit}>
          {isRegister && <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Имя ученика</span><input name="name" type="text" placeholder="Например, Егор" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label>}
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Email</span><input required name="email" type="email" placeholder="you@example.com" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label>
          <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Пароль</span><div className="relative"><input required name="password" minLength={6} type={showPassword ? 'text' : 'password'} placeholder="Минимум 6 символов" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 pr-20 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold text-[#464bff]">{showPassword ? 'Скрыть' : 'Показать'}</button></div></label>
          {isRegister && <label className="flex items-start gap-3 text-xs leading-5 text-[#777985]"><input required type="checkbox" className="mt-1 accent-[#464bff]" /><span>Я принимаю условия использования CoolChess и политику конфиденциальности.</span></label>}
          {!isRegister && <div className="flex justify-end"><button type="button" className="text-[11px] font-bold text-[#464bff]">Забыли пароль?</button></div>}
          <button disabled={pending} type="submit" className="h-13 w-full rounded-xl bg-[#464bff] px-5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(70,75,255,.22)] transition hover:-translate-y-0.5 hover:bg-[#363be8] disabled:cursor-wait disabled:opacity-60">{pending ? 'Подождите…' : isRegister ? 'Создать профиль' : 'Войти в CoolChess'} <span className="ml-2">↗</span></button>
        </form>
        <p className="mt-8 text-center text-xs text-[#999aa5]">{isRegister ? 'Уже есть профиль?' : 'Ты впервые в CoolChess?'} <button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')} className="font-bold text-[#464bff]">{isRegister ? 'Войти' : 'Создать аккаунт'}</button></p>
        <p className="mt-10 text-center text-[10px] leading-5 text-[#b0b1bb]">Авторизация выполняется через backend CoolChess.</p>
      </div></section>
    </div>
  </main>;
}
