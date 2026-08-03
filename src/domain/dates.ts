import type { IsoDate } from "../db/schema";

export function today(): IsoDate {
  return toIso(new Date());
}

export function toIso(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromIso(s: IsoDate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Excel EDATE: same day-of-month n months on, clamped to the end of short months. */
export function addMonths(s: IsoDate, months: number): IsoDate {
  const d = fromIso(s);
  const targetDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDay));
  return toIso(d);
}

export function addDays(s: IsoDate, days: number): IsoDate {
  const d = fromIso(s);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const ms = fromIso(to).getTime() - fromIso(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function startOfYear(year = new Date().getFullYear()): IsoDate {
  return `${year}-01-01`;
}

export function startOfMonth(d = new Date()): IsoDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Monday of the week containing `d`. */
export function startOfWeek(d = new Date()): IsoDate {
  const c = new Date(d);
  const dow = (c.getDay() + 6) % 7; // 0 = Monday
  c.setDate(c.getDate() - dow);
  return toIso(c);
}

export function monthKey(s: IsoDate): string {
  return s.slice(0, 7);
}

/**
 * Days until the next birthday, ignoring the year — so a date already past
 * this year counts towards the next one instead of going negative.
 */
export function daysUntilBirthday(birthDate: IsoDate, from: IsoDate): number | null {
  if (birthDate.length < 10) return null;
  const [, month, day] = birthDate.split("-").map(Number);
  if (!month || !day) return null;

  const fromYear = Number(from.slice(0, 4));
  for (const year of [fromYear, fromYear + 1]) {
    const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const diff = daysBetween(from, candidate);
    if (diff >= 0) return diff;
  }
  return null;
}

/** "2026-08" for the month containing `d`. */
export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Steps a month key forward or back, rolling over the year. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonthKey(d);
}

/** Inclusive first and last day of a month key. */
export function monthRange(key: string): { start: IsoDate; end: IsoDate } {
  const [y, m] = key.split("-").map(Number);
  return { start: `${key}-01`, end: toIso(new Date(y, m, 0)) };
}

export function yearOfMonthKey(key: string): number {
  return Number(key.slice(0, 4));
}

/** Inclusive first and last day of a year. */
export function yearRange(year: number): { start: IsoDate; end: IsoDate } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** How many months of `year` have started as of `asOf`. 1–12. */
export function monthsElapsed(year: number, asOf: IsoDate): number {
  const currentYear = Number(asOf.slice(0, 4));
  if (year < currentYear) return 12;
  if (year > currentYear) return 0;
  return Number(asOf.slice(5, 7));
}

const NL_MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

export function formatDate(s?: IsoDate): string {
  if (!s) return "—";
  const d = fromIso(s);
  return `${d.getDate()} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateShort(s?: IsoDate): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${NL_MONTHS[m - 1]} ${y}`;
}

export function formatEuro(n: number): string {
  return new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}
