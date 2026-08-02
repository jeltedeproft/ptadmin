import type { Invoice, Settings } from "../db/schema";
import { daysBetween, formatDate, formatDateShort, formatEuro, today } from "./dates";

/**
 * Invoice and reminder mails.
 *
 * These open the user's own mail programme rather than sending anything: a
 * browser cannot send mail, and doing it properly would mean a mail provider,
 * an API key and a sending domain. Going through his own mailbox also means the
 * mail comes from his real address and lands in his sent items, which is where
 * he would look for it anyway.
 *
 * The PDF is downloaded alongside, because a mailto link cannot carry an
 * attachment — no browser allows that.
 */

export interface MailDraft {
  to: string;
  subject: string;
  body: string;
  href: string;
}

function draft(to: string, subject: string, body: string): MailDraft {
  return {
    to,
    subject,
    body,
    href: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

export function invoiceMail(invoice: Invoice, s: Settings): MailDraft {
  const who = invoice.recipientName.split(" ")[0];
  const body =
    `Dag ${who},\n\n` +
    `In bijlage vind je factuur ${invoice.number} van ${formatDate(invoice.date)} ` +
    `voor ${formatEuro(invoice.amount)}.\n\n` +
    `Te betalen tegen ${formatDate(invoice.dueDate)} op ${s.iban}, ` +
    `met vermelding "${invoice.number}".\n\n` +
    `${s.vatNote.trim()}\n\n` +
    `Vriendelijke groeten,\n${s.businessName || s.tradeName}`;

  return draft(invoice.recipientEmail ?? "", `Factuur ${invoice.number}`, body);
}

export function reminderMail(invoice: Invoice, s: Settings, asOf: string = today()): MailDraft {
  const who = invoice.recipientName.split(" ")[0];
  const late = daysBetween(invoice.dueDate, asOf);
  const second = !!invoice.reminderSentOn;

  const opening = second
    ? `We stuurden op ${formatDate(invoice.reminderSentOn!)} al een herinnering voor factuur ${invoice.number}.`
    : `Factuur ${invoice.number} van ${formatDate(invoice.date)} verviel op ${formatDate(invoice.dueDate)}` +
      (late > 0 ? `, ${late} dagen geleden.` : ".");

  const body =
    `Dag ${who},\n\n` +
    `${opening}\n\n` +
    `Het openstaande bedrag is ${formatEuro(invoice.amount)}, te betalen op ${s.iban} ` +
    `met vermelding "${invoice.number}".\n\n` +
    `Is er iets misgelopen of heb je de factuur niet ontvangen? Laat het gerust weten.\n\n` +
    `Vriendelijke groeten,\n${s.businessName || s.tradeName}`;

  return draft(
    invoice.recipientEmail ?? "",
    second ? `Tweede herinnering factuur ${invoice.number}` : `Herinnering factuur ${invoice.number}`,
    body,
  );
}

/** Invoices worth chasing: past due, not paid, not cancelled. */
export function needsReminder(invoices: Invoice[], asOf: string = today()): Invoice[] {
  return invoices
    .filter(
      (i) =>
        i.status !== "Betaald" &&
        i.status !== "Geannuleerd" &&
        i.status !== "Concept" &&
        i.dueDate < asOf,
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function reminderLabel(invoice: Invoice, asOf: string = today()): string {
  const late = daysBetween(invoice.dueDate, asOf);
  const sent = invoice.reminderSentOn
    ? ` · herinnerd op ${formatDateShort(invoice.reminderSentOn)}`
    : "";
  return `${late} dagen te laat${sent}`;
}
