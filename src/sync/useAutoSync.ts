import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { hasBackend } from "../db/supabase";
import { syncNow, type SyncResult } from "./engine";

/**
 * Runs a sync when it is likely to be useful and cheap: on start, when the
 * connection comes back, and when the app returns to the foreground after a
 * while. No polling — a coach on mobile data should not pay for a round trip
 * every minute while the app sits open.
 *
 * Failures are deliberately quiet. Being offline is the normal case for this
 * app, not an error worth interrupting anyone over; the manual button under
 * Meer is where the result is meant to be read.
 */

/** Don't re-sync on every tab focus — only if this long has passed. */
const MIN_GAP_MS = 5 * 60 * 1000;

export interface AutoSyncState {
  running: boolean;
  last: SyncResult | null;
}

export function useAutoSync(): AutoSyncState {
  const { session, role } = useAuth();
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<SyncResult | null>(null);
  const lastRunAt = useRef(0);
  const inFlight = useRef(false);

  const userId = session?.user.id;
  const enabled = hasBackend && !!userId && role === "coach";

  useEffect(() => {
    if (!enabled) return;

    async function run(reason: string) {
      // Two syncs at once would fight over the same id map.
      if (inFlight.current || !navigator.onLine) return;
      if (reason === "focus" && Date.now() - lastRunAt.current < MIN_GAP_MS) return;

      inFlight.current = true;
      setRunning(true);
      try {
        const result = await syncNow(userId!);
        lastRunAt.current = Date.now();
        setLast(result);
      } catch {
        // Offline or the server is unreachable: try again on the next trigger.
      } finally {
        inFlight.current = false;
        setRunning(false);
      }
    }

    run("start");

    const onOnline = () => run("online");
    const onVisible = () => {
      if (document.visibilityState === "visible") run("focus");
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, userId]);

  return { running, last };
}
