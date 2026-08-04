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
 * Whether this session actually consumes a credit.
 *
 * Status alone is not enough: an intake is a real session that gets logged and
 * shows up in the history, but it is a first meeting and was never bought, so
 * it never draws from a pack no matter how it went.
 */
export function chargesCredit(session: Pick<Session, "status" | "sessionType">): boolean {
  if (session.sessionType === "Intake") return false;
  return isChargeable(session.status);
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

/**
 * A "Losse sessie" purchase. Mogelijkheid B: it pays for exactly one session
 * and never joins the free credit balance, so buying one does not make the
 * client look like they have credit in hand.
 */
export interface LooseSale {
  transactionId: number;
  date: IsoDate;
  bucket: string;
  /** The session it covers — either linked on the purchase or matched here. */
  usedBySessionId?: number;
}

export interface CreditLedger {
  packs: Pack[];
  looseSales: LooseSale[];
  /** Pack credits still usable today, per bucket. Loose sales are excluded. */
  availableByBucket: Map<string, number>;
  available: number;
  /** Loose sessions paid for but not yet delivered — sessions he still owes. */
  looseUnused: number;
  /** Credits that ran out the clock — money paid, sessions never taken. */
  forfeited: number;
  /** Chargeable sessions that nothing could cover. */
  uncoveredSessionIds: number[];
  /** Earliest expiry among packs that still hold credits. */
  nextExpiry?: IsoDate;
}

export function isLooseSale(t: Transaction): boolean {
  return t.product === "Losse sessie";
}

/**
 * Replays purchases and sessions in date order.
 *
 * Cover order per session: the loose sale explicitly booked for it, then pack
 * credits FIFO (oldest still-valid pack first, so the expiring one drains
 * before the fresh one), then any unassigned loose sale in the same bucket.
 * Packs go before unassigned loose sales because packs are the ones that expire.
 */
export function buildLedger(
  transactions: Transaction[],
  sessions: Session[],
  asOf: IsoDate = today(),
): CreditLedger {
  const ordered = transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));

  const packs: Pack[] = ordered
    .filter((t) => !isLooseSale(t))
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

  const looseSales: LooseSale[] = ordered
    .filter(isLooseSale)
    .map((t) => ({
      transactionId: t.id!,
      date: t.date,
      bucket: bucketOf(t.location, t.sessionType),
      usedBySessionId: t.sessionId,
    }));

  const uncoveredSessionIds: number[] = [];

  const chargeable = sessions
    .filter(chargesCredit)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));

  for (const session of chargeable) {
    const bucket = bucketOf(session.location, session.sessionType);

    // 1. A loose sale booked against this exact session.
    if (looseSales.some((l) => l.usedBySessionId === session.id)) continue;

    // 2. Oldest still-valid pack in the same bucket.
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
      continue;
    }

    // 3. A loose sale that was never linked to a session.
    const loose = looseSales.find(
      (l) => !l.usedBySessionId && l.bucket === bucket && l.date <= session.date,
    );
    if (loose) {
      loose.usedBySessionId = session.id;
      continue;
    }

    uncoveredSessionIds.push(session.id!);
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

  const looseUnused = looseSales.filter((l) => !l.usedBySessionId).length;

  return {
    packs,
    looseSales,
    availableByBucket,
    available,
    looseUnused,
    forfeited,
    uncoveredSessionIds,
    nextExpiry,
  };
}

/** Loose sessions already paid for and still to be delivered, per bucket. */
export function looseAvailableIn(ledger: CreditLedger, bucket: string): number {
  return ledger.looseSales.filter((l) => !l.usedBySessionId && l.bucket === bucket).length;
}

export type Signal = "ok" | "laag" | "op" | "vervalt" | "verlopen" | "inactief" | "los";

export const SIGNAL_LABEL: Record<Signal, string> = {
  ok: "In orde",
  laag: "Nog weinig credits",
  op: "Nieuw pakket nodig",
  vervalt: "Pakket vervalt binnenkort",
  verlopen: "Credits vervallen",
  inactief: "Lang niet getraind",
  los: "Werkt per losse sessie",
};

export interface SignalOptions {
  /** Warn this many days before a pack expires. */
  packExpiryWarningDays: number;
  /** Flag a client who has not trained for this many days. */
  inactiveDays: number;
}

/** Mirrors the "Signaal" column of the Klantenoverzicht. */
export function signalFor(
  ledger: CreditLedger,
  lastSessionDate: IsoDate | undefined,
  opts: SignalOptions,
  asOf: IsoDate = today(),
): Signal {
  const daysSince =
    lastSessionDate === undefined
      ? undefined
      : Math.round((new Date(asOf).getTime() - new Date(lastSessionDate).getTime()) / 86_400_000);
  const stale = daysSince !== undefined && daysSince > opts.inactiveDays;

  if (ledger.forfeited > 0 && ledger.available === 0) return "verlopen";

  if (ledger.available === 0) {
    // A loose session already paid for means nothing is owed yet.
    if (ledger.looseUnused > 0) return "ok";
    if (stale) return "inactief";
    // Someone who only ever buys single sessions sits at zero by design —
    // that is how they work, not a prompt to sell them a pack.
    return ledger.packs.length === 0 && ledger.looseSales.length > 0 ? "los" : "op";
  }

  if (ledger.nextExpiry) {
    const daysLeft = Math.round(
      (new Date(ledger.nextExpiry).getTime() - new Date(asOf).getTime()) / 86_400_000,
    );
    if (daysLeft <= opts.packExpiryWarningDays) return "vervalt";
  }
  if (ledger.available <= 2) return "laag";
  if (stale) return "inactief";
  return "ok";
}
