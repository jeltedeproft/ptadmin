import Dexie, { type Table } from "dexie";
import type {
  Client,
  InformEntry,
  Invoice,
  Lead,
  PriceItem,
  Session,
  Settings,
  Transaction,
} from "./schema";
import { DEFAULT_PRICES, DEFAULT_SETTINGS } from "./seed";

/** Local auto-increment ↔ the id Postgres assigned. */
export interface IdMap {
  table: string;
  localId: number;
  remoteId: string | number;
}

export interface SyncMeta {
  key: string;
  value: string;
}

export class PtAdminDb extends Dexie {
  clients!: Table<Client, number>;
  leads!: Table<Lead, number>;
  prices!: Table<PriceItem, string>;
  transactions!: Table<Transaction, number>;
  sessions!: Table<Session, number>;
  inform!: Table<InformEntry, number>;
  invoices!: Table<Invoice, number>;
  settings!: Table<Settings, number>;
  idmap!: Table<IdMap, [string, number]>;
  syncmeta!: Table<SyncMeta, string>;

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
    // Group trainings: sessions of one shared training carry the same groupId.
    // Prices became versioned, so several records share a baseCode.
    this.version(2).stores({
      sessions: "++id, date, clientId, status, groupId",
      prices: "code, baseCode, location, sessionType, product, active",
    });
    this.version(3).stores({
      leads: "++id, name, status, followUpOn",
    });
    // Sync bookkeeping. idmap ties a local auto-increment to the id Postgres
    // assigned; syncmeta remembers how far the last pull got.
    this.version(4).stores({
      idmap: "[table+localId], [table+remoteId], table",
      syncmeta: "key",
    });
  }
}

export const db = new PtAdminDb();

/**
 * Brings records written by an older version of the app up to the current
 * shape. Invoices gained per-line quantity/rate and an explicit VAT amount,
 * so anything stored before that needs filling in. Idempotent.
 */
async function migrateRecords(): Promise<void> {
  // Prices gained versioning: the original rows become version one of themselves.
  const prices = await db.prices.toArray();
  for (const p of prices) {
    if (p.baseCode) continue;
    await db.prices.update(p.code, { baseCode: p.code });
  }

  const invoices = await db.invoices.toArray();
  for (const inv of invoices) {
    const needsLines = inv.lines.some((l) => l.quantity === undefined);
    if (!needsLines && inv.vatAmount !== undefined) continue;
    await db.invoices.update(inv.id!, {
      lines: inv.lines.map((l) => ({
        ...l,
        quantity: l.quantity ?? 1,
        unitPrice: l.unitPrice ?? l.amount,
      })),
      vatAmount: inv.vatAmount ?? 0,
    });
  }
}

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
    const settings = await db.settings.get(1);
    if (!settings) {
      await db.settings.add(DEFAULT_SETTINGS);
    } else {
      // Back-fill keys added after this install was created, without touching
      // anything the user has already set.
      const missing = Object.fromEntries(
        Object.entries(DEFAULT_SETTINGS).filter(([k]) => !(k in settings)),
      );
      if (Object.keys(missing).length > 0) {
        await db.settings.update(1, missing);
      }
    }
  });
  await migrateRecords();
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get(1);
  if (!s) throw new Error("Instellingen niet gevonden — herlaad de app.");
  return s;
}
