import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '../api/client.js';
import type { SessionUser } from '../types/api.js';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'guest'; user: null }
  | { status: 'authenticated'; user: SessionUser };

type AuthContextValue = AuthState & {
  login(input: { workspace: string; email: string; password: string }): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let active = true;
    void api.me().then(
      ({ user }) => active && setState({ status: 'authenticated', user }),
      () => {
        if (active) setState({ status: 'guest', user: null });
      },
    );
    return () => { active = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    ...state,
    async login(input) {
      const { user } = await api.login(input);
      setState({ status: 'authenticated', user });
    },
    async logout() {
      await api.logout();
      setState({ status: 'guest', user: null });
    },
  }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
