/** Login and registration screen connected to the shared auth state. */
import { useState, type FormEvent } from 'react';
import { useAuth } from '../model/AuthProvider';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
const pendingEmailKey = 'coolchess.pendingVerificationEmail';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#auth/reset')) return 'reset';
    if (hash.includes('/forgot')) return 'forgot';
    return hash.includes('/register') || Boolean(sessionStorage.getItem(pendingEmailKey)) ? 'register' : 'login';
  });
  const [resetToken] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('token') ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [localError, setLocalError] = useState('');
  const [registrationEmail, setRegistrationEmail] = useState(() => sessionStorage.getItem(pendingEmailKey) ?? '');
  const [awaitingCode, setAwaitingCode] = useState(() => Boolean(sessionStorage.getItem(pendingEmailKey)));
  const [notice, setNotice] = useState('');
  const { login, register, verifyEmail, resendVerification, requestPasswordReset, resetPassword, error, clearError } = useAuth();
  const isRegister = mode === 'register';

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setAwaitingCode(false);
    setRegistrationEmail('');
    sessionStorage.removeItem(pendingEmailKey);
    setNotice('');
    setLocalError('');
    clearError();
    window.history.replaceState(null, '', `#auth/${nextMode}`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const displayName = String(form.get('name') ?? '').trim();

    setPending(true);
    setLocalError('');
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setNotice('Если аккаунт с таким email существует, мы отправили ссылку для смены пароля. Проверьте входящие и папку «Спам».');
      } else if (mode === 'reset') {
        if (password !== String(form.get('confirm_password') ?? '')) {
          setLocalError('Пароли не совпадают.');
          return;
        }
        if (!resetToken) {
          setLocalError('Ссылка для смены пароля недействительна. Запросите письмо ещё раз.');
          return;
        }
        await resetPassword(resetToken, password);
        setMode('login');
        setNotice('Пароль изменён. Теперь войдите с новым паролем.');
        window.history.replaceState(null, '', '#auth/login');
      } else if (awaitingCode) {
        const code = String(form.get('verification_code') ?? '').trim();
        await verifyEmail(registrationEmail, code);
        sessionStorage.removeItem(pendingEmailKey);
        setRegistrationEmail('');
        setAwaitingCode(false);
        setMode('login');
        setNotice('Email подтверждён. Теперь войдите в аккаунт.');
        window.history.replaceState(null, '', '#auth/login');
      } else if (isRegister) {
        await register(email, password, displayName);
        sessionStorage.setItem(pendingEmailKey, email);
        setRegistrationEmail(email);
        setAwaitingCode(true);
        setNotice(`Код отправлен на ${email}. Проверьте также папку «Спам».`);
      } else {
        await login(email, password);
        window.location.hash = '#home';
      }

    } catch {
      // Текст ошибки уже положен в контекст (AuthProvider.error) и показан
      // под переключателем режимов; здесь гасим rejection, чтобы в консоли
      // не было unhandled rejection при failed to fetch / дубликате почты.
    } finally {
      setPending(false);
    }
  };

  const resendCode = async () => {
    setResendPending(true);
    try {
      setNotice(await resendVerification(registrationEmail));
    } catch {
      // Ошибка уже отображается через общий auth-контекст.
    } finally {
      setResendPending(false);
    }
  };

  const changeRegistrationEmail = () => {
    sessionStorage.removeItem(pendingEmailKey);
    setRegistrationEmail('');
    setAwaitingCode(false);
    setNotice('');
    clearError();
  };

  const openForgotPassword = () => switchMode('forgot');

  return <main className="min-h-screen overflow-hidden bg-[#f7f7fb] text-[#111]">
    <div className="grid min-h-screen lg:grid-cols-[minmax(420px,0.78fr)_minmax(520px,1.22fr)]">
      <section className="relative hidden h-screen self-start overflow-hidden bg-[#464bff] p-10 text-white lg:sticky lg:top-0 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-28 h-96 w-96 rounded-full bg-[#dce204] opacity-90 blur-[1px]" />
        <div className="absolute -bottom-44 -left-36 h-[520px] w-[520px] rounded-full border-[72px] border-white/10" />
        <a href="#home" className="relative z-10 inline-flex w-fit items-center" aria-label="На главную"><img src="/coolchess-logo.svg" alt="CoolChess" className="h-14 w-[280px] object-contain object-left brightness-0 invert" /></a>
        <div className="relative z-10 max-w-md"><span className="mb-5 inline-flex rounded-full bg-white/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em]">Шахматная школа</span><h1 className="text-6xl font-extrabold leading-[0.94] tracking-[-0.06em]">Твой ход<br /><span className="text-[#dce204]">к сильной игре.</span></h1><p className="mt-7 max-w-sm text-sm leading-7 text-white/75">Сохраняй прогресс, проходи темы и решай задачи каждый день.</p></div>
        <div className="relative z-10 flex gap-8 text-white/70"><span><b className="block text-2xl text-white">39</b><small className="text-[10px] uppercase tracking-wider">тем курса</small></span><span><b className="block text-2xl text-white">6 000</b><small className="text-[10px] uppercase tracking-wider">задач</small></span></div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-[470px]">
        <div className="mb-10 flex items-center justify-between lg:hidden"><a href="#home" aria-label="На главную"><img src="/coolchess-logo.svg" alt="CoolChess" className="h-12 w-[220px] object-contain object-left" /></a><span className="rounded-full bg-[#fffce7] px-3 py-2 text-[10px] font-bold text-[#464bff]">♟ ученик</span></div>
        <div className="mb-8">{awaitingCode && <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#464bff]">02 · ПОДТВЕРЖДЕНИЕ EMAIL</span>}<h2 className="mt-4 text-4xl font-extrabold leading-none tracking-[-0.05em] sm:text-5xl">{awaitingCode ? <>Проверь свою<br /><span className="text-[#464bff]">почту.</span></> : mode === 'forgot' ? <>Вернём доступ<br /><span className="text-[#464bff]">к аккаунту.</span></> : mode === 'reset' ? <>Новый<br /><span className="text-[#464bff]">пароль.</span></> : isRegister ? <>Создай свой<br /><span className="text-[#464bff]">маршрут.</span></> : <>С возвращением<br /><span className="text-[#464bff]">в CoolChess.</span></>}</h2><p className="mt-5 text-sm leading-6 text-[#777985]">{awaitingCode ? `Мы отправили шестизначный код на ${registrationEmail}. Он действует 10 минут.` : mode === 'forgot' ? 'Укажи email аккаунта — пришлём ссылку для смены пароля.' : mode === 'reset' ? 'Придумай новый надёжный пароль длиной от 12 символов.' : isRegister ? 'Один аккаунт — теория, задачи, серия и рейтинг в одном месте.' : 'Войди, чтобы продолжить обучение.'}</p></div>
        {!awaitingCode && (mode === 'login' || mode === 'register') && <div className="mb-7 grid grid-cols-2 rounded-xl bg-[#ececf4] p-1"><button type="button" onClick={() => switchMode('login')} className={`rounded-lg px-4 py-3 text-xs font-bold transition ${!isRegister ? 'bg-white text-[#111] shadow-sm' : 'text-[#777985]'}`}>Войти</button><button type="button" onClick={() => switchMode('register')} className={`rounded-lg px-4 py-3 text-xs font-bold transition ${isRegister ? 'bg-white text-[#111] shadow-sm' : 'text-[#777985]'}`}>Регистрация</button></div>}
        {(localError || error) && <div className="mb-5 rounded-xl border border-[#f1b8b8] bg-[#fff0f0] px-4 py-3 text-xs font-semibold text-[#a32929]">{localError || error}</div>}
        {notice && <div className="mb-5 rounded-xl border border-[#c9d7ff] bg-[#f0f4ff] px-4 py-3 text-xs font-semibold text-[#3439bd]" role="status">{notice}</div>}
        <form className="space-y-4" onSubmit={submit}>
          {awaitingCode ? <><label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Код из письма</span><input required name="verification_code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm tracking-[0.4em] outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label><div className="flex flex-wrap gap-4"><button disabled={resendPending || pending} type="button" onClick={() => void resendCode()} className="text-[11px] font-bold text-[#464bff] disabled:opacity-60">{resendPending ? 'Отправляем…' : 'Отправить код повторно'}</button><button type="button" onClick={changeRegistrationEmail} className="text-[11px] font-bold text-[#777985]">Изменить email</button></div></> : <>
            {mode === 'forgot' && <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Email аккаунта</span><input required name="email" type="email" autoComplete="email" placeholder="you@example.com" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label>}
            {mode === 'reset' && <><label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Новый пароль</span><input required name="password" minLength={12} autoComplete="new-password" type={showPassword ? 'text' : 'password'} placeholder="Не менее 12 символов" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label><label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Повторите новый пароль</span><input required name="confirm_password" minLength={12} autoComplete="new-password" type={showPassword ? 'text' : 'password'} placeholder="Повторите пароль" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label></>}
            {isRegister && <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Имя / никнейм</span><input required minLength={3} maxLength={24} name="name" type="text" autoComplete="nickname" placeholder="Например, КоньНаЦентре" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label>}
            {(mode === 'login' || isRegister) && <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Email</span><input required name="email" type="email" autoComplete="email" placeholder="you@example.com" className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /></label>}
            {(mode === 'login' || isRegister) && <label className="block"><span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-[#777985]">Пароль</span><div className="relative"><input required name="password" minLength={isRegister ? 12 : 1} autoComplete={isRegister ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} placeholder={isRegister ? 'Не менее 12 символов' : 'Пароль'} className="h-13 w-full rounded-xl border border-[#e1e2eb] bg-white px-4 pr-20 text-sm outline-none transition placeholder:text-[#b6b7c1] focus:border-[#464bff] focus:ring-4 focus:ring-[#464bff]/10" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold text-[#464bff]">{showPassword ? 'Скрыть' : 'Показать'}</button></div></label>}
            {isRegister && <label className="flex items-start gap-3 text-xs leading-5 text-[#777985]"><input required type="checkbox" className="mt-1 accent-[#464bff]" /><span>Я принимаю условия использования CoolChess и политику конфиденциальности.</span></label>}
          </>}
          {mode === 'login' && <div className="flex justify-end"><button type="button" onClick={openForgotPassword} className="text-[11px] font-bold text-[#464bff]">Забыли пароль?</button></div>}
          <button disabled={pending} type="submit" className="h-13 w-full rounded-xl bg-[#464bff] px-5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(70,75,255,.22)] transition hover:-translate-y-0.5 hover:bg-[#363be8] disabled:cursor-wait disabled:opacity-60">{pending ? 'Подождите…' : awaitingCode ? 'Подтвердить email' : mode === 'forgot' ? 'Отправить ссылку' : mode === 'reset' ? 'Сохранить новый пароль' : isRegister ? 'Создать профиль' : 'Войти в CoolChess'} <span className="ml-2">↗</span></button>

        </form>
        {!awaitingCode && (mode === 'login' || mode === 'register') && <p className="mt-8 text-center text-xs text-[#999aa5]">{isRegister ? 'Уже есть профиль?' : 'Ты впервые в CoolChess?'} <button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')} className="font-bold text-[#464bff]">{isRegister ? 'Войти' : 'Создать аккаунт'}</button></p>}
        {!awaitingCode && (mode === 'forgot' || mode === 'reset') && <p className="mt-8 text-center text-xs text-[#999aa5]"><button type="button" onClick={() => switchMode('login')} className="font-bold text-[#464bff]">← Вернуться ко входу</button></p>}
        <p className="mt-10 text-center text-[10px] leading-5 text-[#b0b1bb]">Авторизация выполняется через backend CoolChess.</p>
      </div></section>
    </div>
  </main>;
}
