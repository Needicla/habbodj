import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export interface User {
  _id: string;
  username: string;
  avatarColor: string;
  isAnonymous: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  loginAnonymous: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const saveAuth = useCallback((token: string, user: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setToken(token);
    setUser(user);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { data } = await api.post('/auth/login', { username, password });
    saveAuth(data.token, data.user);
  }, [saveAuth]);

  const register = useCallback(async (username: string, password: string) => {
    const { data } = await api.post('/auth/register', { username, password });
    saveAuth(data.token, data.user);
  }, [saveAuth]);

  const loginAnonymous = useCallback(async () => {
    const { data } = await api.post('/auth/anonymous');
    saveAuth(data.token, data.user);
  }, [saveAuth]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginAnonymous, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
