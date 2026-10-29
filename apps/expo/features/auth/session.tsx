import type { ReactNode } from "react";
import React from "react";
import { ApiClient } from "@/services/api/client";
import { storage } from "@/services/storage/storage";
import type { Session, WeaveUser } from "@/types/weave";

type SessionContextValue = {
  api: ApiClient;
  loading: boolean;
  session: Session | null;
  user: WeaveUser | null;
  logout: () => Promise<void>;
  saveSession: (session: Session) => Promise<void>;
  refreshMe: () => Promise<void>;
};

const SessionContext = React.createContext<SessionContextValue | null>(null);

const SESSION_KEY = "weave_session";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<WeaveUser | null>(null);

  const logout = React.useCallback(async () => {
    await storage.removeItem(SESSION_KEY);
    setSession(null);
    setUser(null);
  }, []);

  const api = React.useMemo(() => new ApiClient(() => session, () => void logout()), [logout, session]);

  const saveSession = React.useCallback(async (next: Session) => {
    await storage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    setUser(next.user);
  }, []);

  const refreshMe = React.useCallback(async () => {
    if (!session) return;
    const nextUser = await api.request<WeaveUser>("/me");
    setUser(nextUser);
  }, [api, session]);

  React.useEffect(() => {
    let mounted = true;
    storage.getItem(SESSION_KEY)
      .then((raw) => {
        if (!mounted) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Session;
          setSession(parsed);
          setUser(parsed.user);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return <SessionContext.Provider value={{ api, loading, logout, refreshMe, saveSession, session, user }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
