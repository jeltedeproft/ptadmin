import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { Client, IsoDate, Session, Settings, Transaction } from "../db/schema";
import { buildLedger, isChargeable, signalFor, type CreditLedger, type Signal } from "../domain/credits";
import { today } from "../domain/dates";

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get(1), []);
}

export function useClients(): Client[] | undefined {
  return useLiveQuery(() => db.clients.orderBy("name").toArray(), []);
}

export function usePrices() {
  return useLiveQuery(() => db.prices.toArray(), []);
}

export interface ClientOverview {
  client: Client;
  ledger: CreditLedger;
  lastSession?: IsoDate;
  lastPurchase?: IsoDate;
  signal: Signal;
  sessionCount: number;
}

/** The OVERZICHT PER KLANT sheet, recomputed from the source records. */
export function useOverview(): ClientOverview[] | undefined {
  return useLiveQuery(async () => {
    const [clients, transactions, sessions, settings] = await Promise.all([
      db.clients.orderBy("name").toArray(),
      db.transactions.toArray(),
      db.sessions.toArray(),
      db.settings.get(1),
    ]);
    const signalOpts = {
      packExpiryWarningDays: settings?.packExpiryWarningDays ?? 30,
      inactiveDays: settings?.inactiveDays ?? 30,
    };
    const asOf = today();

    return clients.map((client) => {
      const ts = transactions.filter((t) => t.clientId === client.id);
      const ss = sessions.filter((s) => s.clientId === client.id);
      const ledger = buildLedger(ts, ss, asOf);
      const chargeable = ss.filter((s) => isChargeable(s.status));
      const lastSession = ss.map((s) => s.date).sort().at(-1);
      const lastPurchase = ts.map((t) => t.date).sort().at(-1);
      return {
        client,
        ledger,
        lastSession,
        lastPurchase,
        signal: signalFor(ledger, lastSession, signalOpts, asOf),
        sessionCount: chargeable.length,
      };
    });
  }, []);
}

export function useClientOverview(clientId?: number): ClientOverview | undefined {
  const all = useOverview();
  if (!all || clientId === undefined) return undefined;
  return all.find((o) => o.client.id === clientId);
}

export function useTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.orderBy("date").reverse().toArray(), []);
}

export function useSessions(): Session[] | undefined {
  return useLiveQuery(() => db.sessions.orderBy("date").reverse().toArray(), []);
}

export function useInform() {
  return useLiveQuery(() => db.inform.orderBy("date").reverse().toArray(), []);
}

export function useInvoices() {
  return useLiveQuery(() => db.invoices.orderBy("date").reverse().toArray(), []);
}

export function useLeads() {
  return useLiveQuery(() => db.leads.orderBy("name").toArray(), []);
}
