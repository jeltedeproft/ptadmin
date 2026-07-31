import Dexie, { type Table } from "dexie";
import type {
  Client,
  InformEntry,
  Invoice,
  PriceItem,
  Session,
  Settings,
  Transaction,
} from "./schema";
import { DEFAULT_PRICES, DEFAULT_SETTINGS } from "./seed";

export class PtAdminDb extends Dexie {
  clients!: Table<Client, number>;
  prices!: Table<PriceItem, string>;
  transactions!: Table<Transaction, number>;
  sessions!: Table<Session, number>;
  inform!: Table<InformEntry, number>;
  invoices!: Table<Invoice, number>;
  settings!: Table<Settings, number>;

  constructor() {
    super("ptadmin");
    this.version(1).stores({
      clients: "++id, name, status, nextEvaluation",
      prices: "code, location, sessionType, product",
      transactions: "++id, date, clientId, paid, expiresOn, invoiceNeeded",
      sessions: "++id, date, clientId, status",
      inform: "++id, date, invoiced",
      invoices: "++id, &number, date, status, type",
      settings: "id",
    });
  }
}

export const db = new PtAdminDb();

/**
 * Populates the price matrix and settings on first run, and back-fills any
 * product codes added since the install was created. Existing rows are left
 * alone so edits made on the Prijzen screen survive. Safe to call repeatedly.
 */
export async function ensureSeeded(): Promise<void> {
  await db.transaction("rw", db.prices, db.settings, async () => {
    const existing = new Set(await db.prices.toCollection().primaryKeys());
    const missing = DEFAULT_PRICES.filter((p) => !existing.has(p.code));
    if (missing.length > 0) {
      await db.prices.bulkAdd(missing);
    }
    if (!(await db.settings.get(1))) {
      await db.settings.add(DEFAULT_SETTINGS);
    }
  });
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get(1);
  if (!s) throw new Error("Instellingen niet gevonden — herlaad de app.");
  return s;
}
