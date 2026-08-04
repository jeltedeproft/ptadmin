import type { Appointment, Client, Settings } from "../db/schema";

/**
 * Calendar files (RFC 5545).
 *
 * This is how clients get their sessions into a calendar: an invitation they
 * open, not an account they connect. It works in Google, Apple and Outlook
 * alike, needs no permission from them, and costs no Google project.
 *
 * Times are written as floating local time — no Z, no timezone — which means
 * "this wall-clock time". Everyone involved trains in the same timezone, so
 * that reads correctly for all of them and avoids shipping a VTIMEZONE block
 * or getting summer time wrong.
 */

/** Escapes the characters RFC 5545 gives meaning to. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Lines must not exceed 75 octets; continuations start with one space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(" " + rest);
  return parts.join("\r\n");
}

function stamp(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function addMinutes(date: string, time: string, minutes: number): [string, string] {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, m + minutes, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  ];
}

function utcStamp(d = new Date()): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export interface IcsEvent {
  appointment: Appointment;
  clientName: string;
  clientEmail?: string;
}

/**
 * @param method PUBLISH for "here is my schedule", REQUEST for an actual
 *   invitation that a mail client will show with accept/decline.
 */
export function buildIcs(
  events: IcsEvent[],
  settings: Settings,
  method: "PUBLISH" | "REQUEST" = "PUBLISH",
): string {
  const organiser = settings.email || "noreply@ptadmin.local";
  const brand = settings.tradeName || settings.businessName || "PT Admin";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${esc(brand)}//PT Admin//NL`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
  ];

  for (const { appointment: a, clientName, clientEmail } of events) {
    const [endDate, endTime] = addMinutes(a.date, a.startTime, a.durationMinutes);
    const title =
      a.sessionType === "Solo" ? `Personal training` : `${a.sessionType} training`;

    lines.push(
      "BEGIN:VEVENT",
      // Stable per appointment, so re-sending updates the event instead of
      // creating a second one.
      `UID:appointment-${a.id}@ptadmin`,
      `DTSTAMP:${utcStamp()}`,
      `DTSTART:${stamp(a.date, a.startTime)}`,
      `DTEND:${stamp(endDate, endTime)}`,
      `SUMMARY:${esc(`${title} — ${brand}`)}`,
      `LOCATION:${esc(a.location === "Aan huis" ? "Bij jou thuis" : settings.address || "Privéruimte")}`,
      `DESCRIPTION:${esc([`${a.sessionType} · ${a.durationMinutes} minuten`, a.note, clientName].filter(Boolean).join("\n"))}`,
      `ORGANIZER;CN=${esc(brand)}:mailto:${organiser}`,
      a.status === "Afgezegd" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "SEQUENCE:0",
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(title)}`,
      "END:VALARM",
    );

    if (method === "REQUEST" && clientEmail) {
      lines.push(
        `ATTENDEE;CN=${esc(clientName)};RSVP=TRUE:mailto:${clientEmail}`,
      );
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Everything still to come, for the coach's own calendar. */
export function upcoming(appointments: Appointment[], from: string): Appointment[] {
  return appointments
    .filter((a) => a.date >= from && !a.sessionId && a.status === "Gepland")
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export function clientOf(clients: Client[], id: number): Client | undefined {
  return clients.find((c) => c.id === id);
}
