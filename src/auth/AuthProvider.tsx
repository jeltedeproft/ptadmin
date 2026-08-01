import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasBackend, supabase } from "../db/supabase";
import type { Role } from "../portals";

interface AuthState {
  /** Null while still restoring the stored session. */
  loading: boolean;
  session: Session | null;
  role: Role | null;
  /** The clients row this login belongs to, for a client account. */
  clientId: number | null;
  /** True when the profile could not be read — usually offline. */
  offline: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const ROLE_CACHE = "ptadmin.role";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [clientId, setClientId] = useState<number | null>(null);
  const [offline, setOffline] = useState(false);

  async function loadProfile(s: Session | null) {
    if (!s || !supabase) {
      setRole(null);
      setClientId(null);
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", s.user.id)
      .maybeSingle();

    if (error) {
      // Offline, or the profile row has not replicated yet. Fall back to the
      // last known role so a coach with no signal is not locked out of his own
      // app — the server still enforces the real permissions on every request.
      const cached = localStorage.getItem(ROLE_CACHE) as Role | null;
      setRole(cached);
      setOffline(true);
      return;
    }

    setOffline(false);
    const r = (data?.role as Role | undefined) ?? "client";
    setRole(r);
    localStorage.setItem(ROLE_CACHE, r);

    if (r === "client") {
      const { data: own } = await supabase
        .from("clients")
        .select("id")
        .eq("auth_user_id", s.user.id)
        .maybeSingle();
      setClientId(own?.id ?? null);
    } else {
      setClientId(null);
    }
  }

  useEffect(() => {
    if (!hasBackend || !supabase) {
      setLoading(false);
      return;
    }
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!alive) return;
      setSession(s);
      await loadProfile(s);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    loading,
    session,
    role,
    clientId,
    offline,
    signOut: async () => {
      localStorage.removeItem(ROLE_CACHE);
      await supabase?.auth.signOut();
    },
    refresh: () => loadProfile(session),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth buiten AuthProvider");
  return ctx;
}
