/** Shares the signed-in user and auth actions with the app screens. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/authApi';
import type { AuthUser } from '../api/authApi';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<string>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authApi.getToken()) {
      setLoading(false);
      return;
    }
    authApi.getMe().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    error,
    clearError: () => setError(null),
    login: async (email, password) => {
      setError(null);
      try { setUser(await authApi.login(email, password)); }
      catch (reason) { const message = reason instanceof Error ? reason.message : 'Не удалось войти'; setError(message); throw reason; }
    },
    register: async (email, password, displayName) => {
      setError(null);
      try { await authApi.register(email, password, displayName); }
      catch (reason) { const message = reason instanceof Error ? reason.message : 'Не удалось зарегистрироваться'; setError(message); throw reason; }
    },
    verifyEmail: async (email, code) => {
      setError(null);
      try { await authApi.verifyEmail(email, code); }
      catch (reason) { const message = reason instanceof Error ? reason.message : 'Не удалось подтвердить email'; setError(message); throw reason; }
    },
    resendVerification: async (email) => {
      setError(null);
      try { return (await authApi.resendVerification(email)).message; }
      catch (reason) { const message = reason instanceof Error ? reason.message : 'Не удалось отправить код повторно'; setError(message); throw reason; }
    },
    requestPasswordReset: async (email) => {
      setError(null);
      try { await authApi.requestPasswordReset(email); }
      catch (reason) { const message = reason instanceof Error ? reason.message : 'Не удалось отправить ссылку для сброса пароля'; setError(message); throw reason; }
    },
    resetPassword: async (token, password) => {
      setError(null);
      try { await authApi.resetPassword(token, password); }
      catch (reason) { const message = reason instanceof Error ? reason.message : 'Не удалось изменить пароль'; setError(message); throw reason; }
    },
    logout: async () => { await authApi.logout(); setUser(null); },
  }), [error, loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return context;
}
