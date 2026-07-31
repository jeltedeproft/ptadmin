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
