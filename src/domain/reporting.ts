import type {
  Client,
  InformEntry,
  Invoice,
  IsoDate,
  Location,
  Session,
  SessionType,
  Settings,
  Transaction,
} from "../db/schema";
import type { ClientOverview } from "../hooks/useData";
import { isChargeable } from "./credits";
import {
  addDays,
  daysBetween,
  monthRange,
  monthsElapsed,
  startOfWeek,
  today,
  yearOfMonthKey,
  yearRange,
} from "./dates";

export interface DashboardData {
  overview: ClientOverview[];
  transactions: Transaction[];
  sessions: Session[];
  inform: InformEntry[];
  invoices: Invoice[];
}

export interface DashboardReport {
  month: string;
  year: number;
  revenue: {
    month: number;
    year: number;
    /** Own clients, selected year. */
    own: number;
    /** IN FORM, selected year. */
    inform: number;
    /** Actually collected in the selected month. */
    receivedMonth: number;
    averageMonth: number;
    projectedYear: number;
  };
  outstanding: number;
  clients: {
    active: number;
    paused: number;
    stopped: number;
    newInMonth: Client[];
    evaluationsInMonth: ClientOverview[];
    evaluationsSoon: ClientOverview[];
    inactive: ClientOverview[];
    expiringPacks: ClientOverview[];
    lowCredits: ClientOverview[];
    needsPack: ClientOverview[];
  };
  sessions: {
    week: number;
    month: number;
    year: number;
    byType: Partial<Record<SessionType, number>>;
    byLocation: Partial<Record<Location, number>>;
  };
  unpaidTransactions: Transaction[];
  uninvoicedInform: InformEntry[];
  overdueInvoices: Invoice[];
  unsentInvoices: Invoice[];
}

const inRange = (d: IsoDate, start: IsoDate, end: IsoDate) => d >= start && d <= end;

export interface MonthlyPoint {
  key: string; // "2026-03"
  own: number;
  inform: number;
  total: number;
  sessions: number;
  /** Clients with at least one charged session that month. */
  activeClients: number;
}

/** Twelve rows for one calendar year, January first, zero-filled. */
export function buildMonthlySeries(year: number, data: DashboardData): MonthlyPoint[] {
  const rows: MonthlyPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const { start, end } = monthRange(key);

    const own = data.transactions
      .filter((t) => inRange(t.date, start, end))
      .reduce((s, t) => s + t.amount, 0);
    const inform = data.inform
      .filter((e) => inRange(e.date, start, end))
      .reduce((s, e) => s + e.amount, 0);

    const monthSessions = data.sessions.filter(
      (s) => isChargeable(s.status) && inRange(s.date, start, end),
    );

    rows.push({
      key,
      own,
      inform,
      total: own + inform,
      sessions: monthSessions.length,
      activeClients: new Set(monthSessions.map((s) => s.clientId)).size,
    });
  }
  return rows;
}

/**
 * Every figure on the dashboard, for one selected month. Year figures follow
 * the year that month sits in, so paging back into December also moves the
 * annual totals and the threshold gauges.
 */
export function buildReport(
  monthKey: string,
  data: DashboardData,
  settings: Settings,
  asOf: IsoDate = today(),
): DashboardReport {
  const { overview, transactions, sessions, inform, invoices } = data;
  const year = yearOfMonthKey(monthKey);
  const month = monthRange(monthKey);
  const yr = yearRange(year);
  const weekStart = startOfWeek();

  const txInMonth = transactions.filter((t) => inRange(t.date, month.start, month.end));
  const txInYear = transactions.filter((t) => inRange(t.date, yr.start, yr.end));
  const informInMonth = inform.filter((e) => inRange(e.date, month.start, month.end));
  const informInYear = inform.filter((e) => inRange(e.date, yr.start, yr.end));

  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);

  const ownYear = sum(txInYear, (t) => t.amount);
  const informYear = sum(informInYear, (e) => e.amount);
  const revenueYear = ownYear + informYear;
  const revenueMonth = sum(txInMonth, (t) => t.amount) + sum(informInMonth, (e) => e.amount);

  // Cash actually collected in the month, as opposed to revenue booked.
  const receivedMonth =
    sum(
      transactions.filter((t) => t.paid && t.paidOn && inRange(t.paidOn, month.start, month.end)),
      (t) => t.amount,
    ) +
    sum(
      invoices.filter(
        (i) => i.status === "Betaald" && i.paidOn && inRange(i.paidOn, month.start, month.end),
      ),
      (i) => i.amount,
    );

  const elapsed = monthsElapsed(year, asOf);
  const averageMonth = elapsed > 0 ? revenueYear / elapsed : 0;
  const projectedYear = elapsed > 0 ? averageMonth * 12 : revenueYear;

  const unpaidTransactions = transactions.filter((t) => !t.paid);
  const openInvoices = invoices.filter((i) => i.status !== "Betaald" && i.status !== "Geannuleerd");
  const outstanding = sum(unpaidTransactions, (t) => t.amount) + sum(openInvoices, (i) => i.amount);

  const chargeable = sessions.filter((s) => isChargeable(s.status));
  const sessionsInMonth = chargeable.filter((s) => inRange(s.date, month.start, month.end));
  const byType: Partial<Record<SessionType, number>> = {};
  const byLocation: Partial<Record<Location, number>> = {};
  for (const s of sessionsInMonth) {
    byType[s.sessionType] = (byType[s.sessionType] ?? 0) + 1;
    byLocation[s.location] = (byLocation[s.location] ?? 0) + 1;
  }

  const evaluationsSoonCutoff = addDays(asOf, settings.evaluationLookaheadDays);

  return {
    month: monthKey,
    year,
    revenue: {
      month: revenueMonth,
      year: revenueYear,
      own: ownYear,
      inform: informYear,
      receivedMonth,
      averageMonth,
      projectedYear,
    },
    outstanding,
    clients: {
      active: overview.filter((o) => o.client.status === "Actief").length,
      paused: overview.filter((o) => o.client.status === "Gepauzeerd").length,
      stopped: overview.filter((o) => o.client.status === "Stopgezet").length,
      newInMonth: overview
        .filter((o) => inRange(o.client.startDate, month.start, month.end))
        .map((o) => o.client),
      evaluationsInMonth: overview.filter(
        (o) => o.client.nextEvaluation && inRange(o.client.nextEvaluation, month.start, month.end),
      ),
      evaluationsSoon: overview.filter(
        (o) => o.client.nextEvaluation && o.client.nextEvaluation <= evaluationsSoonCutoff,
      ),
      inactive: overview.filter((o) => o.client.status === "Actief" && o.signal === "inactief"),
      expiringPacks: overview.filter(
        (o) =>
          o.ledger.available > 0 &&
          o.ledger.nextExpiry &&
          daysBetween(asOf, o.ledger.nextExpiry) <= settings.packExpiryWarningDays,
      ),
      lowCredits: overview.filter((o) => o.ledger.available > 0 && o.ledger.available <= 2),
      needsPack: overview.filter(
        (o) => o.client.status === "Actief" && (o.signal === "op" || o.signal === "verlopen"),
      ),
    },
    sessions: {
      week: chargeable.filter((s) => s.date >= weekStart && s.date <= asOf).length,
      month: sessionsInMonth.length,
      year: chargeable.filter((s) => inRange(s.date, yr.start, yr.end)).length,
      byType,
      byLocation,
    },
    unpaidTransactions,
    uninvoicedInform: inform.filter((e) => !e.invoiced),
    overdueInvoices: openInvoices.filter((i) => i.dueDate < asOf),
    unsentInvoices: invoices.filter((i) => i.status === "Gegenereerd"),
  };
}
