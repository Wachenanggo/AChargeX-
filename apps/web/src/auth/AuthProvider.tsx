import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isRole, type Role } from '@achargex/shared';
import { supabase } from '../lib/supabase';
import { setDemoRole } from '../lib/api';
import { reconnectLive } from '../lib/live';
import { APP_URL, GOOGLE_OAUTH } from '../lib/config';

export interface AppUser {
  id: string;
  name: string;
  email?: string;
  role: Role;
  isDemo: boolean;
}

interface AuthCtx {
  user: AppUser | null;
  /** true until the initial session check completes */
  loading: boolean;
  mode: 'supabase' | 'demo';
  googleEnabled: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<{ needsConfirmation: boolean }>;
  resetPassword(email: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  continueAsGuest(): void;
  signOut(): Promise<void>;
  /** DEMO MODE ONLY — switch the demo account's role to explore Network/Control. */
  setDemoRoleFor(role: Role): void;
  sessionExpired: boolean;
  clearExpired(): void;
}

const Ctx = createContext<AuthCtx | null>(null);
const DEMO_KEY = 'ax.demoUser';

function loadDemo(): AppUser | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as AppUser;
    return isRole(u.role) ? { ...u, isDemo: true } : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode: 'supabase' | 'demo' = supabase ? 'supabase' : 'demo';
  const [user, setUser] = useState<AppUser | null>(() => (mode === 'demo' ? loadDemo() : null));
  const [loading, setLoading] = useState(mode === 'supabase');
  const [sessionExpired, setExpired] = useState(false);

  // Keep the API client's demo role in sync. Set during render (idempotent) so child
  // effects that fetch on mount already use the right role.
  setDemoRole(user?.isDemo ? user.role : 'guest');
  useEffect(() => {
    reconnectLive();
  }, [user?.role, user?.isDemo, user?.id]);

  useEffect(() => {
    if (!supabase) return;
    let wasSignedIn = false;
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (s) {
        wasSignedIn = true;
        setUser(fromSupabase(s.user));
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (s) {
        wasSignedIn = true;
        setUser(fromSupabase(s.user));
      } else {
        if (wasSignedIn && event === 'SIGNED_OUT') setUser((u) => (u?.role === 'guest' ? u : null));
        if (wasSignedIn && (event as string) === 'TOKEN_REFRESH_FAILED') setExpired(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const persistDemo = (u: AppUser | null) => {
    setUser(u);
    try {
      if (u) localStorage.setItem(DEMO_KEY, JSON.stringify(u));
      else localStorage.removeItem(DEMO_KEY);
    } catch {
      /* ignore */
    }
  };

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
        return;
      }
      if (!email.includes('@') || password.length < 6) throw new Error('Enter a valid email and a password of at least 6 characters.');
      const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      persistDemo({ id: 'demo-driver', name, email, role: 'driver', isDemo: true });
    },
    [],
  );

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: `${APP_URL}/` } });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    }
    if (!name.trim() || !email.includes('@') || password.length < 8) throw new Error('Enter your name, a valid email and a password of at least 8 characters.');
    persistDemo({ id: 'demo-driver', name: name.trim(), email, role: 'driver', isDemo: true });
    return { needsConfirmation: false };
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Password reset needs Supabase Auth. This build is running in demo mode.');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/account` });
    if (error) throw new Error(error.message);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase || !GOOGLE_OAUTH) throw new Error('Google sign-in is not configured.');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${APP_URL}/` } });
    if (error) throw new Error(error.message);
  }, []);

  const continueAsGuest = useCallback(() => {
    const g: AppUser = { id: 'guest', name: 'Guest', role: 'guest', isDemo: mode === 'demo' };
    if (mode === 'demo') persistDemo(g);
    else setUser(g);
  }, [mode]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    persistDemo(null);
  }, []);

  const setDemoRoleFor = useCallback(
    (role: Role) => {
      if (mode !== 'demo') return;
      const ids: Record<Role, string> = { guest: 'guest', driver: 'demo-driver', owner: 'demo-owner', operator: 'demo-operator', admin: 'demo-admin', super_admin: 'demo-super' };
      const base = loadDemo();
      persistDemo({ id: ids[role], name: base?.name && base.role !== 'guest' ? base.name : 'Demo user', email: base?.email, role, isDemo: true });
    },
    [mode],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      mode,
      googleEnabled: mode === 'supabase' && GOOGLE_OAUTH,
      signIn,
      signUp,
      resetPassword,
      signInWithGoogle,
      continueAsGuest,
      signOut,
      setDemoRoleFor,
      sessionExpired,
      clearExpired: () => setExpired(false),
    }),
    [user, loading, mode, signIn, signUp, resetPassword, signInWithGoogle, continueAsGuest, signOut, setDemoRoleFor, sessionExpired],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function fromSupabase(u: { id: string; email?: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): AppUser {
  // Role is read from app_metadata (server-controlled), never user_metadata.
  const r = u.app_metadata?.role;
  return {
    id: u.id,
    email: u.email,
    name: (u.user_metadata?.full_name as string) || u.email?.split('@')[0] || 'Driver',
    role: isRole(r) ? r : 'driver',
    isDemo: false,
  };
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
