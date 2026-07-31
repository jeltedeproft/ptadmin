import type { IsoDate, Session, SessionStatus, Transaction } from "../db/schema";
import { today } from "./dates";

/**
 * Which session outcomes burn a credit. Confirmed by Yens.
 *
 * The workbook never encoded this — the formula that survived the Google Sheets
 * import compared against a stale "Live" value — so the rule lives here: the
 * client pays unless they cancelled in time or the session was explicitly waived.
 */
export const CHARGEABLE_STATUSES: Record<SessionStatus, boolean> = {
  Uitgevoerd: true,
  "Te laat geannuleerd": true,
  "Niet verschenen": true,
  "Geannuleerd op tijd": false,
  "Niet aangerekend": false,
};

export function isChargeable(status: SessionStatus): boolean {
  return CHARGEABLE_STATUSES[status];
}

/**
 * Credits are not fungible across the price matrix: a Privéruimte Solo pack
 * cannot pay for an Aan huis Duo session. Bucketing by location + session type
 * mirrors how OVERZICHT PER KLANT split its columns.
 */
export function bucketOf(location: string, sessionType: string): string {
  return `${location}|${sessionType}`;
}

export interface Pack {
  transactionId: number;
  date: IsoDate;
  expiresOn?: IsoDate;
  bucket: string;
  bought: number;
  used: number;
  remaining: number;
  /** True when the pack still has credits but is past its expiry date. */
  expiredUnused: boolean;
}

export interface CreditLedger {
  packs: Pack[];
  /** Credits still usable today, per bucket. */
  availableByBucket: Map<string, number>;
  available: number;
  /** Credits that ran out the clock — money paid, sessions never taken. */
  forfeited: number;
  /** Chargeable sessions that no pack could cover. */
  uncoveredSessionIds: number[];
  /** Earliest expiry among packs that still hold credits. */
  nextExpiry?: IsoDate;
}

/**
 * Replays purchases and sessions in date order, consuming credits FIFO within
 * each bucket and skipping packs that had already expired when the session ran.
 */
export function buildLedger(
  transactions: Transaction[],
  sessions: Session[],
  asOf: IsoDate = today(),
): CreditLedger {
  const packs: Pack[] = transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0))
    .map((t) => ({
      transactionId: t.id!,
      date: t.date,
      expiresOn: t.expiresOn,
      bucket: bucketOf(t.location, t.sessionType),
      bought: t.creditsBought,
      used: 0,
      remaining: t.creditsBought,
      expiredUnused: false,
    }));

  const uncoveredSessionIds: number[] = [];

  const chargeable = sessions
    .filter((s) => isChargeable(s.status))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));

  for (const session of chargeable) {
    const bucket = bucketOf(session.location, session.sessionType);
    const pack = packs.find(
      (p) =>
        p.bucket === bucket &&
        p.remaining > 0 &&
        p.date <= session.date &&
        (!p.expiresOn || p.expiresOn >= session.date),
    );
    if (pack) {
      pack.used += 1;
      pack.remaining -= 1;
    } else {
      uncoveredSessionIds.push(session.id!);
    }
  }

  const availableByBucket = new Map<string, number>();
  let available = 0;
  let forfeited = 0;
  let nextExpiry: IsoDate | undefined;

  for (const pack of packs) {
    if (pack.remaining <= 0) continue;
    const expired = !!pack.expiresOn && pack.expiresOn < asOf;
    pack.expiredUnused = expired;
    if (expired) {
      forfeited += pack.remaining;
      continue;
    }
    available += pack.remaining;
    availableByBucket.set(pack.bucket, (availableByBucket.get(pack.bucket) ?? 0) + pack.remaining);
    if (pack.expiresOn && (!nextExpiry || pack.expiresOn < nextExpiry)) {
      nextExpiry = pack.expiresOn;
    }
  }

  return { packs, availableByBucket, available, forfeited, uncoveredSessionIds, nextExpiry };
}

export type Signal = "ok" | "laag" | "op" | "vervalt" | "verlopen" | "inactief";

export const SIGNAL_LABEL: Record<Signal, string> = {
  ok: "In orde",
  laag: "Nog weinig credits",
  op: "Credits op",
  vervalt: "Pakket vervalt binnenkort",
  verlopen: "Credits vervallen",
  inactief: "Geen recente sessie",
};

/** Mirrors the "Signaal" column of OVERZICHT PER KLANT. */
export function signalFor(
  ledger: CreditLedger,
  lastSessionDate: IsoDate | undefined,
  warningDays: number,
  asOf: IsoDate = today(),
): Signal {
  if (ledger.forfeited > 0 && ledger.available === 0) return "verlopen";
  if (ledger.available === 0) return "op";
  if (ledger.nextExpiry) {
    const daysLeft = Math.round(
      (new Date(ledger.nextExpiry).getTime() - new Date(asOf).getTime()) / 86_400_000,
    );
    if (daysLeft <= warningDays) return "vervalt";
  }
  if (ledger.available <= 2) return "laag";
  if (lastSessionDate) {
    const daysSince = Math.round(
      (new Date(asOf).getTime() - new Date(lastSessionDate).getTime()) / 86_400_000,
    );
    if (daysSince > 45) return "inactief";
  }
  return "ok";
}
