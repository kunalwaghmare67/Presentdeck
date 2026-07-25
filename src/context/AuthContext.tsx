import React, { createContext, useContext, useState } from 'react';
import type { AuthSession } from '../types';
import { authenticateUser } from '../config/authConfig';
import { useStore } from '../store';

interface AuthContextType {
  currentUser: AuthSession | null;
  login: (username: string, passwordAttempt: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem('presentdeck_session');
      const session = saved ? JSON.parse(saved) : null;
      if (session) {
        useStore.setState({ currentUser: session });
      }
      return session;
    } catch {
      return null;
    }
  });

  const login = async (username: string, passwordAttempt: string): Promise<boolean> => {
    const session = await authenticateUser(username, passwordAttempt);
    if (session) {
      localStorage.setItem('presentdeck_session', JSON.stringify(session));
      useStore.setState({ currentUser: session });
      await useStore.getState().clearCurrentSession();
      setCurrentUser(session);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('presentdeck_session');
    useStore.setState({ currentUser: null });
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
