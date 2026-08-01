import { db } from "../db/db";
import { isChargeable } from "./credits";
import { formatMonth, monthKey, today } from "./dates";

/**
 * CSV for Excel in a Dutch locale: semicolon-separated, so columns split
 * without an import wizard. A UTF-8 BOM keeps accented names intact.
 */
const SEP = ";";

export function toCsv(headers: string[], rows: (string | number | undefined)[][]): string {
  const cell = (v: string | number | undefined) => {
    if (v === undefined || v === null) return "";
    // Decimal comma, so Excel reads numbers as numbers.
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(SEP)).join("\r\n");
}

function download(name: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const yes = (b: boolean) => (b ? "ja" : "nee");

export type ExportKind =
  | "klanten"
  | "transacties"
  | "sessies"
  | "facturen"
  | "inform"
  | "omzet-per-maand"
  | "openstaand"
  | "leads";

export const EXPORTS: { kind: ExportKind; label: string; hint: string }[] = [
  { kind: "klanten", label: "Klanten", hint: "Contactgegevens, status, evaluaties" },
  { kind: "leads", label: "Leads", hint: "Prospecten en opvolgdatums" },
  { kind: "transacties", label: "Transacties", hint: "Aankopen, bedragen, betaalstatus" },
  { kind: "sessies", label: "Sessies", hint: "Datum, klant, type, status" },
  { kind: "facturen", label: "Facturen", hint: "Nummer, bedrag, status, vervaldatum" },
  { kind: "inform", label: "IN FORM-prestaties", hint: "Uren, tarief, facturatiemaand" },
  { kind: "omzet-per-maand", label: "Omzet per maand", hint: "Eigen klanten, IN FORM, totaal" },
  { kind: "openstaand", label: "Openstaande betalingen", hint: "Wat nog binnen moet komen" },
];

export async function exportCsv(kind: ExportKind): Promise<void> {
  const [clients, transactions, sessions, invoices, inform] = await Promise.all([
    db.clients.toArray(),
    db.transactions.orderBy("date").toArray(),
    db.sessions.orderBy("date").toArray(),
    db.invoices.orderBy("date").toArray(),
    db.inform.orderBy("date").toArray(),
  ]);
  const nameOf = (id?: number) => clients.find((c) => c.id === id)?.name ?? "";

  switch (kind) {
    case "klanten":
      return download(
        kind,
        toCsv(
          ["Klant ID", "Naam", "Facturatienaam", "Status", "Startdatum", "Locatie", "E-mail", "Telefoon", "Facturatieadres", "Ondernemingsnummer", "Laatste evaluatie", "Volgende evaluatie", "Notitie"],
          clients.map((c) => [c.id, c.name, c.billingName, c.status, c.startDate, c.location, c.email, c.phone, c.billingAddress?.replace(/\n/g, ", "), c.companyNumber, c.lastEvaluation, c.nextEvaluation, c.note]),
        ),
      );

    case "leads": {
      const leads = await db.leads.orderBy("name").toArray();
      return download(
        kind,
        toCsv(
          ["Naam", "Telefoon", "E-mail", "Bron", "Eerste contact", "Interesse", "Gewenste locatie", "Gewenst type", "Status", "Opvolgen op", "Notitie"],
          leads.map((l) => [l.name, l.phone, l.email, l.source, l.firstContact, l.interest, l.wantedLocation, l.wantedSessionType, l.status, l.followUpOn, l.note]),
        ),
      );
    }

    case "transacties":
      return download(
        kind,
        toCsv(
          ["Transactie ID", "Aankoopdatum", "Klant", "Locatie", "Type", "Product", "Productcode", "Credits", "Bedrag", "Vervalt op", "Betaald", "Betaald op", "Betaalwijze", "Factuur nodig", "Factuurnummer", "Opmerking"],
          transactions.map((t) => [t.id, t.date, nameOf(t.clientId), t.location, t.sessionType, t.product, t.productCode, t.creditsBought, t.amount, t.expiresOn, yes(t.paid), t.paidOn, t.paymentMethod, yes(t.invoiceNeeded), t.invoiceNumber, t.note]),
        ),
      );

    case "sessies":
      return download(
        kind,
        toCsv(
          ["Sessie ID", "Datum", "Klant", "Locatie", "Type", "Status", "Credit gebruikt", "Groep", "Notitie"],
          sessions.map((s) => [s.id, s.date, nameOf(s.clientId), s.location, s.sessionType, s.status, isChargeable(s.status) ? 1 : 0, s.groupId, s.note]),
        ),
      );

    case "facturen":
      return download(
        kind,
        toCsv(
          ["Factuurnummer", "Datum", "Vervaldatum", "Type", "Gefactureerd aan", "Omschrijving", "Bedrag", "Btw", "Status", "Betaald op"],
          invoices.map((i) => [i.number, i.date, i.dueDate, i.type, i.recipientName, i.lines.map((l) => l.description).join(" | "), i.amount, i.vatAmount ?? 0, i.status, i.paidOn]),
        ),
      );

    case "inform":
      return download(
        kind,
        toCsv(
          ["Prestatie ID", "Datum", "Type", "Klant of groep", "Uren", "Uurtarief", "Bedrag", "Factuurmaand", "Gefactureerd", "Factuurnummer", "Notitie"],
          inform.map((e) => [e.id, e.date, e.sessionType, e.clientOrGroup, e.hours, e.hourlyRate, e.amount, formatMonth(monthKey(e.date)), yes(e.invoiced), e.invoiceNumber, e.note]),
        ),
      );

    case "omzet-per-maand": {
      const months = new Map<string, { own: number; inform: number }>();
      for (const t of transactions) {
        const k = monthKey(t.date);
        const m = months.get(k) ?? { own: 0, inform: 0 };
        m.own += t.amount;
        months.set(k, m);
      }
      for (const e of inform) {
        const k = monthKey(e.date);
        const m = months.get(k) ?? { own: 0, inform: 0 };
        m.inform += e.amount;
        months.set(k, m);
      }
      return download(
        kind,
        toCsv(
          ["Maand", "Omzet eigen klanten", "Omzet IN FORM", "Totaal"],
          [...months.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, m]) => [formatMonth(k), m.own, m.inform, m.own + m.inform]),
        ),
      );
    }

    case "openstaand": {
      const rows: (string | number | undefined)[][] = [
        ...transactions
          .filter((t) => !t.paid)
          .map((t) => ["Verkoop", t.date, nameOf(t.clientId), t.productCode, t.amount, ""]),
        ...invoices
          .filter((i) => i.status !== "Betaald" && i.status !== "Geannuleerd")
          .map((i) => ["Factuur", i.date, i.recipientName, i.number, i.amount, i.dueDate]),
      ];
      return download(
        kind,
        toCsv(["Soort", "Datum", "Klant", "Referentie", "Bedrag", "Vervaldatum"], rows),
      );
    }
  }
}
