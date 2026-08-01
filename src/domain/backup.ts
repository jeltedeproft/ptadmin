import { db } from "../db/db";
import { today } from "./dates";

const BACKUP_VERSION = 1;

interface Backup {
  version: number;
  exportedAt: string;
  clients: unknown[];
  /** Added after version 1 — older back-ups simply have none. */
  leads?: unknown[];
  prices: unknown[];
  transactions: unknown[];
  sessions: unknown[];
  inform: unknown[];
  invoices: unknown[];
  settings: unknown[];
}

export async function exportBackup(): Promise<void> {
  const payload: Backup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    clients: await db.clients.toArray(),
    leads: await db.leads.toArray(),
    prices: await db.prices.toArray(),
    transactions: await db.transactions.toArray(),
    sessions: await db.sessions.toArray(),
    inform: await db.inform.toArray(),
    invoices: await db.invoices.toArray(),
    settings: await db.settings.toArray(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ptadmin-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Replaces everything currently stored. The caller is responsible for confirming. */
export async function importBackup(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as Backup;
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(`Onbekende back-upversie: ${parsed.version}`);
  }

  await db.transaction(
    "rw",
    [db.clients, db.leads, db.prices, db.transactions, db.sessions, db.inform, db.invoices, db.settings],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.leads.clear(),
        db.prices.clear(),
        db.transactions.clear(),
        db.sessions.clear(),
        db.inform.clear(),
        db.invoices.clear(),
        db.settings.clear(),
      ]);
      await db.clients.bulkAdd(parsed.clients as never);
      await db.leads.bulkAdd((parsed.leads ?? []) as never);
      await db.prices.bulkAdd(parsed.prices as never);
      await db.transactions.bulkAdd(parsed.transactions as never);
      await db.sessions.bulkAdd(parsed.sessions as never);
      await db.inform.bulkAdd(parsed.inform as never);
      await db.invoices.bulkAdd(parsed.invoices as never);
      await db.settings.bulkAdd(parsed.settings as never);
    },
  );
}
