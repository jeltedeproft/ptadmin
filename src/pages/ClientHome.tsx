import { useEffect, useState } from "react";
import { Badge, Card, Empty, Kpi } from "../components/ui";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../db/supabase";
import { buildLedger, isChargeable } from "../domain/credits";
import type { Session, Transaction } from "../db/schema";
import { formatDate, formatDateShort, formatEuro } from "../domain/dates";

interface Mine {
  name: string;
  nextEvaluation?: string;
  transactions: Transaction[];
  sessions: Session[];
}

/**
 * The client's own view. Reads straight from Supabase rather than the local
 * store: a trainee opens this occasionally on their own phone, so there is
 * nothing to keep in sync and no reason to cache their coach's database.
 *
 * Row-level security means these queries return only their own rows even
 * though no filter is written here — see supabase/migrations/0001_init.sql.
 */
export default function ClientHome({ view = "overzicht" }: { view?: "overzicht" | "sessies" | "pakketten" }) {
  const { clientId } = useAuth();
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let alive = true;

    (async () => {
      const [me, tx, ss] = await Promise.all([
        supabase.from("clients").select("name, next_evaluation").maybeSingle(),
        supabase.from("transactions").select("*").order("date"),
        supabase.from("sessions").select("*").order("date", { ascending: false }),
      ]);
      if (!alive) return;
      if (me.error || tx.error || ss.error) {
        setError("Kon je gegevens niet ophalen. Probeer het straks opnieuw.");
        return;
      }
      setMine({
        name: me.data?.name ?? "",
        nextEvaluation: me.data?.next_evaluation ?? undefined,
        transactions: (tx.data ?? []).map(fromRow),
        sessions: (ss.data ?? []).map(sessionFromRow),
      });
    })();

    return () => {
      alive = false;
    };
  }, [clientId]);

  if (error) return <Empty>{error}</Empty>;
  if (!mine) return <Empty>Laden…</Empty>;

  const ledger = buildLedger(mine.transactions, mine.sessions);
  const done = mine.sessions.filter((s) => isChargeable(s.status));

  if (view === "sessies") {
    return (
      <>
        <h1>Mijn sessies</h1>
        <p className="sub">{done.length} trainingen gevolgd</p>
        {mine.sessions.length === 0 ? (
          <Empty>Nog geen sessies.</Empty>
        ) : (
          <div className="list">
            {mine.sessions.map((s) => (
              <div key={s.id}>
                <div>
                  <div className="item-title">{formatDate(s.date)}</div>
                  <div className="item-sub">
                    {s.sessionType} · {s.location}
                  </div>
                </div>
                <Badge tone={isChargeable(s.status) ? "" : "ok"}>{s.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  if (view === "pakketten") {
    return (
      <>
        <h1>Mijn pakketten</h1>
        <p className="sub">{ledger.available} credits over</p>
        {ledger.packs.length === 0 && ledger.looseSales.length === 0 ? (
          <Empty>Nog geen aankopen.</Empty>
        ) : (
          <div className="list">
            {[...ledger.packs].reverse().map((p) => {
              const t = mine.transactions.find((x) => x.id === p.transactionId);
              return (
                <div key={p.transactionId}>
                  <div>
                    <div className="item-title">
                      {t?.product} · {t?.sessionType}
                    </div>
                    <div className="item-sub">
                      Gekocht {formatDateShort(p.date)} · {formatEuro(t?.amount ?? 0)}
                      {p.expiresOn ? ` · geldig tot ${formatDateShort(p.expiresOn)}` : ""}
                    </div>
                  </div>
                  <Badge tone={p.expiredUnused ? "verlopen" : p.remaining > 0 ? "ok" : ""}>
                    {p.remaining}/{p.bought}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <h1>Dag {mine.name.split(" ")[0]}</h1>
      <p className="sub">Je overzicht bij je coach.</p>

      <div className="grid">
        <Kpi label="Credits over" value={ledger.available} size="lg" />
        <Kpi label="Trainingen gevolgd" value={done.length} size="lg" />
        <Kpi
          label="Pakket geldig tot"
          value={ledger.nextExpiry ? formatDateShort(ledger.nextExpiry) : "—"}
          size="lg"
        />
      </div>

      {ledger.available === 0 && ledger.looseUnused === 0 && (
        <div className="alert crit" style={{ marginTop: 12 }}>
          Je credits zijn op. Spreek je coach aan voor een nieuw pakket.
        </div>
      )}
      {ledger.available > 0 && ledger.available <= 2 && (
        <div className="alert" style={{ marginTop: 12 }}>
          Nog {ledger.available} credit{ledger.available === 1 ? "" : "s"} — tijd om bij te bestellen.
        </div>
      )}
      {ledger.looseUnused > 0 && (
        <div className="alert" style={{ marginTop: 12, borderLeftColor: "var(--accent)" }}>
          Je hebt {ledger.looseUnused} betaalde losse sessie
          {ledger.looseUnused === 1 ? "" : "s"} tegoed.
        </div>
      )}

      {mine.nextEvaluation && (
        <Card style={{ marginTop: 12 }}>
          <div className="row-between">
            <span className="muted">Volgende evaluatie</span>
            <strong>{formatDate(mine.nextEvaluation)}</strong>
          </div>
        </Card>
      )}

      <h2>Laatste trainingen</h2>
      {done.length === 0 ? (
        <Empty>Nog geen trainingen.</Empty>
      ) : (
        <div className="list">
          {done.slice(0, 5).map((s) => (
            <div key={s.id}>
              <div>
                <div className="item-title">{formatDate(s.date)}</div>
                <div className="item-sub">
                  {s.sessionType} · {s.location}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* Postgres uses snake_case; the domain model uses camelCase. */
function fromRow(r: Record<string, unknown>): Transaction {
  return {
    id: r.id as number,
    date: r.date as string,
    clientId: r.client_id as number,
    location: r.location as Transaction["location"],
    sessionType: r.session_type as Transaction["sessionType"],
    product: r.product as Transaction["product"],
    productCode: r.product_code as string,
    creditsBought: r.credits_bought as number,
    amount: Number(r.amount),
    validityMonths: r.validity_months as number,
    expiresOn: (r.expires_on as string) ?? undefined,
    paid: r.paid as boolean,
    paidOn: (r.paid_on as string) ?? undefined,
    invoiceNeeded: r.invoice_needed as boolean,
    sessionId: (r.session_id as number) ?? undefined,
  };
}

function sessionFromRow(r: Record<string, unknown>): Session {
  return {
    id: r.id as number,
    date: r.date as string,
    clientId: r.client_id as number,
    location: r.location as Session["location"],
    sessionType: r.session_type as Session["sessionType"],
    status: r.status as Session["status"],
    groupId: (r.group_id as string) ?? undefined,
  };
}
