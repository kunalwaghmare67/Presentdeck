import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AuthSession } from '../types';
import { authenticateUser } from '../config/authConfig';
import { useStore } from '../store';
import { supabase } from '../lib/supabase';
import { hydrateFromSupabase } from '../lib/sync';

interface AuthContextType {
  currentUser: AuthSession | null;
  supabaseUser: User | null;
  login: (username: string, passwordAttempt: string) => Promise<boolean>;
  sendMagicLink: (email: string) => Promise<{ error: Error | null }>;
  logout: () => void;
  signOutCloud: () => Promise<void>;
  isGuestMode: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);

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
    // Listen to Supabase Auth state changes (Magic link callback, session restore)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user || null;
      setSupabaseUser(u);
      if (u) {
        // Auto-hydrate store & IndexedDB cache from Supabase cloud Postgres + Storage
        await hydrateFromSupabase(u.id, useStore);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}`,
      },
    });
    return { error: error as Error | null };
  };

  const signOutCloud = async () => {
    await supabase.auth.signOut();
    setSupabaseUser(null);
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
    signOutCloud();
  };

  const isGuestMode = !supabaseUser;

  return (
    <AuthContext.Provider value={{ currentUser, supabaseUser, login, sendMagicLink, logout, signOutCloud, isGuestMode }}>
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
