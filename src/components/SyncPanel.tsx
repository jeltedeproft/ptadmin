import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { hasBackend } from "../db/supabase";
import { lastSyncedAt, pendingCount, syncNow, type SyncResult } from "../sync/engine";
import { formatDate } from "../domain/dates";

export default function SyncPanel() {
  const { session, role } = useAuth();
  const [pending, setPending] = useState<number | null>(null);
  const [last, setLast] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function refresh() {
    setPending(await pendingCount());
    setLast(await lastSyncedAt());
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!hasBackend || !session || role !== "coach") return null;

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const r = await syncNow(session!.user.id);
      setResult(r);
    } catch (err) {
      setResult({ pushed: 0, pulled: 0, skipped: 0, errors: [(err as Error).message], at: "" });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  return (
    <>
      <h2>Synchronisatie</h2>
      <p className="sub">
        De app blijft lokaal werken, ook zonder verbinding. Synchroniseren zet je gegevens op de
        server en haalt op wat je op een ander toestel invoerde.
      </p>

      <div className="list" style={{ marginBottom: 10 }}>
        <div>
          <div>
            <div className="item-title">
              {pending === null ? "…" : pending === 0 ? "Alles verstuurd" : `${pending} nog te versturen`}
            </div>
            <div className="item-sub">
              {last ? `Laatst gesynchroniseerd op ${formatDate(last.slice(0, 10))}` : "Nog nooit gesynchroniseerd"}
            </div>
          </div>
        </div>
      </div>

      <button className="btn-primary btn-block" onClick={run} disabled={busy}>
        {busy ? "Bezig…" : "Nu synchroniseren"}
      </button>

      {result && (
        <div
          className={`alert${result.errors.length ? " crit" : ""}`}
          style={{ marginTop: 10, borderLeftColor: result.errors.length ? undefined : "var(--ok)" }}
        >
          <strong>
            {result.pushed} verstuurd, {result.pulled} opgehaald
            {result.skipped > 0 && `, ${result.skipped} overgeslagen`}
          </strong>
          {result.skipped > 0 && result.errors.length === 0 && (
            <div className="item-sub">
              Overgeslagen records wachten op iets dat nog niet verstuurd is. Draai het gerust
              nog eens.
            </div>
          )}
          {result.errors.slice(0, 5).map((e, i) => (
            <div key={i} className="item-sub">
              {e}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
