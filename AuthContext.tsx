import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AuthSession } from '../types';
import { authenticateUser } from '../config/authConfig';
import { useStore } from '../store';
import { generateWorkspaceCode, ensureWorkspace, hydrateFromSupabase } from '../lib/sync';

const LOCAL_STORAGE_CODE_KEY = 'presentdeck_workspace_code';

interface AuthContextType {
  currentUser: AuthSession | null;
  workspaceCode: string | null;
  login: (username: string, passwordAttempt: string) => Promise<boolean>;
  logout: () => void;
  createWorkspace: () => Promise<string>;
  joinWorkspace: (code: string) => Promise<boolean>;
  leaveWorkspace: () => void;
  isGuestMode: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [workspaceCode, setWorkspaceCode] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_CODE_KEY) || null;
    } catch {
      return null;
    }
  });

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

  useEffect(() => {
    if (workspaceCode) {
      hydrateFromSupabase(workspaceCode, useStore).catch(console.error);
    }
  }, [workspaceCode]);

  const createWorkspace = async (): Promise<string> => {
    const code = generateWorkspaceCode();
    await ensureWorkspace(code);
    localStorage.setItem(LOCAL_STORAGE_CODE_KEY, code);
    setWorkspaceCode(code);
    await hydrateFromSupabase(code, useStore);
    return code;
  };

  const joinWorkspace = async (code: string): Promise<boolean> => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode || cleanCode.length < 4) return false;

    const ok = await ensureWorkspace(cleanCode);
    if (ok) {
      localStorage.setItem(LOCAL_STORAGE_CODE_KEY, cleanCode);
      setWorkspaceCode(cleanCode);
      await hydrateFromSupabase(cleanCode, useStore);
      return true;
    }
    return false;
  };

  const leaveWorkspace = () => {
    localStorage.removeItem(LOCAL_STORAGE_CODE_KEY);
    setWorkspaceCode(null);
  };

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

  const isGuestMode = !workspaceCode;

  return (
    <AuthContext.Provider value={{
      currentUser,
      workspaceCode,
      login,
      logout,
      createWorkspace,
      joinWorkspace,
      leaveWorkspace,
      isGuestMode,
    }}>
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
