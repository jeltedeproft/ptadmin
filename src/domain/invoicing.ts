import type { jsPDF } from "jspdf";
import type { Invoice, Settings } from "../db/schema";
import { formatDateShort, formatEuro } from "./dates";

/** "2026-001" → "2026-002". Falls back to appending a counter for odd formats. */
export function nextNumber(current: string): string {
  const m = current.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${current}-2`;
  const [, head, digits, tail] = m;
  const incremented = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${head}${incremented}${tail}`;
}

/** Dynamically imported so jsPDF (and its html2canvas dependency) stays out of the initial bundle. */
export async function generateInvoicePdf(invoice: Invoice, s: Settings): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 20;
  const right = 190;
  let y = 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(s.tradeName || s.businessName, left, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y += 6;
  for (const line of [s.businessName, s.address, `Ondernemingsnr. ${s.companyNumber}`, s.email]) {
    if (line) {
      doc.text(line, left, y);
      y += 4.2;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FACTUUR", right, 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(invoice.number, right, 31, { align: "right" });
  doc.text(`Datum: ${formatDateShort(invoice.date)}`, right, 36, { align: "right" });
  doc.text(`Vervaldatum: ${formatDateShort(invoice.dueDate)}`, right, 41, { align: "right" });

  y = Math.max(y, 48) + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Factuur aan", left, y);
  doc.setFont("helvetica", "normal");
  y += 5;
  for (const line of [invoice.recipientName, invoice.recipientAddress, invoice.recipientEmail]) {
    if (line) {
      doc.text(line, left, y);
      y += 4.2;
    }
  }

  y += 8;
  doc.setDrawColor(200);
  doc.line(left, y, right, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Omschrijving", left, y);
  doc.text("Bedrag", right, y, { align: "right" });
  y += 3;
  doc.line(left, y, right, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  for (const line of invoice.lines) {
    const wrapped = doc.splitTextToSize(line.description, 130) as string[];
    doc.text(wrapped, left, y);
    doc.text(formatEuro(line.amount), right, y, { align: "right" });
    y += wrapped.length * 4.6 + 2;
  }

  y += 2;
  doc.line(left, y, right, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Totaal", left, y);
  doc.text(formatEuro(invoice.amount), right, y, { align: "right" });

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(s.vatNote.trim(), left, y);
  y += 6;
  doc.text(
    `Te betalen binnen ${s.paymentTermDays} dagen op ${s.iban}, met vermelding "${invoice.number}".`,
    left,
    y,
  );

  if (invoice.note) {
    y += 8;
    doc.setTextColor(90);
    doc.text(doc.splitTextToSize(invoice.note, 170) as string[], left, y);
    doc.setTextColor(0);
  }

  return doc;
}

export async function downloadInvoicePdf(invoice: Invoice, s: Settings): Promise<void> {
  const doc = await generateInvoicePdf(invoice, s);
  doc.save(`Factuur ${invoice.number} - ${invoice.recipientName}.pdf`);
}
