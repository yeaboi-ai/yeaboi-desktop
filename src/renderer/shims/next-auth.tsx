// Shim for `next-auth/react`, aliased in electron.vite.config.ts.
//
// The desktop has no NextAuth: identity is a name and email stored by the
// main process (settings.json), and every consumer of useSession() in the
// planning UI reads only session.user.{name,email,image} plus a loading
// status. SessionProvider here IS the identity provider — providers.tsx keeps
// its import untouched. When no identity exists yet (first run) the provider
// renders the identity screen instead of its children.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { FirstRunScreen } from '../app/first-run';

export interface Session {
  user: { id?: string; name?: string | null; email?: string | null; image?: string | null };
  expires?: string;
}

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  data: Session | null;
  status: SessionStatus;
  update: () => Promise<Session | null>;
}

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: 'loading',
  update: async () => null,
});

export function SessionProvider({ children }: { children: ReactNode; session?: unknown }) {
  const [state, setState] = useState<{ data: Session | null; status: SessionStatus }>({
    data: null,
    status: 'loading',
  });

  const load = useCallback(async (): Promise<Session | null> => {
    const identity = await window.yeaboi.getIdentity();
    if (!identity) {
      setState({ data: null, status: 'unauthenticated' });
      return null;
    }
    const session: Session = {
      user: { name: identity.name, email: identity.email, image: null },
    };
    setState({ data: session, status: 'authenticated' });
    return session;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'unauthenticated') {
    return <FirstRunScreen onDone={() => void load()} />;
  }
  return (
    <SessionContext.Provider value={{ ...state, update: load }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

export async function signIn(): Promise<void> {
  // Identity is set on first run; nothing to sign in to.
}

export async function signOut(_options?: { callbackUrl?: string }): Promise<void> {
  // Single-user desktop — "sign out" has no meaning; identity is edited in
  // Settings instead.
}

export function getCsrfToken(): Promise<string> {
  return Promise.resolve('');
}
