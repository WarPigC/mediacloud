import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../lib/api';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  usedStorageBytes: number;
  storageQuotaBytes: number;
  createdAt: string;
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ data: UserProfile }>('/auth/me');
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = async (username: string, password: string) => {
    const res = await api.post<{ data: UserProfile }>('/auth/login', { username, password });
    setUser(res.data);
  };

  const register = async (username: string, email: string, password: string) => {
    await api.post('/auth/register', { username, email, password });
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
