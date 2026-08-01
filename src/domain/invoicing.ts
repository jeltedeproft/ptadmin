import type { jsPDF } from "jspdf";
import type { Invoice, Settings } from "../db/schema";
import { formatDate, formatEuro } from "./dates";

/** "2026-001" → "2026-002". Falls back to appending a counter for odd formats. */
export function nextNumber(current: string): string {
  const m = current.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${current}-2`;
  const [, head, digits, tail] = m;
  const incremented = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${head}${incremented}${tail}`;
}

// Layout constants, in mm on A4. Matches the reference invoice in docs/.
const LEFT = 22;
const RIGHT = 188;
const MID = 108; // where the right-hand column starts
const INK: [number, number, number] = [43, 43, 43]; // soft black, not pure
const MUTED: [number, number, number] = [120, 120, 120];
const RULE: [number, number, number] = [205, 195, 178]; // sand accent

/**
 * Renders the invoice in the YENS house style: wordmark, "Gefactureerd aan"
 * block with the client's name and address, a quantity/rate/amount table,
 * the art. 56bis exemption note, and contact + payment details in the footer.
 *
 * Dynamically imported so jsPDF (and its html2canvas dependency) stays out of
 * the initial bundle.
 */
export async function generateInvoicePdf(invoice: Invoice, s: Settings): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setTextColor(...INK);

  let y = 30;

  // ---- header: logo or letter-spaced wordmark ----
  if (s.logoDataUrl) {
    try {
      const props = doc.getImageProperties(s.logoDataUrl);
      const w = 46;
      const h = (props.height / props.width) * w;
      doc.addImage(s.logoDataUrl, LEFT, y - 8, w, h);
      y += h + 6;
    } catch {
      // Unreadable image — fall through to the wordmark below.
      y = wordmark(doc, s, y);
    }
  } else {
    y = wordmark(doc, s, y);
  }

  y += 16;

  // ---- title + meta (left) and recipient (right) ----
  const metaTop = y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(17);
  doc.setTextColor(...MUTED);
  doc.text("Factuur", LEFT, y);
  doc.setTextColor(...INK);

  y += 14;
  doc.setFontSize(9.5);
  const meta: [string, string][] = [
    ["Factuurnummer: ", invoice.number],
    ["Factuurdatum: ", formatDate(invoice.date)],
    ["Vervaldatum: ", formatDate(invoice.dueDate)],
  ];
  for (const [label, value] of meta) {
    doc.setFont("helvetica", "bold");
    doc.text(label, LEFT, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, LEFT + doc.getTextWidth(label), y);
    y += 6;
  }

  // Recipient — the client's name is required on every invoice.
  let ry = metaTop + 3;
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text("Gefactureerd aan:", MID, ry);
  doc.setTextColor(...INK);
  ry += 8;
  doc.setFont("helvetica", "bold");
  doc.text(invoice.recipientName, MID, ry);
  doc.setFont("helvetica", "normal");
  ry += 6;
  for (const line of (invoice.recipientAddress ?? "").split("\n")) {
    if (!line.trim()) continue;
    doc.text(line.trim(), MID, ry);
    ry += 5.5;
  }

  y = Math.max(y, ry) + 18;

  // ---- line table ----
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  const colQty = 118;
  const colRate = 150;
  doc.text("Omschrijving", LEFT, y);
  doc.text("Aantal", colQty, y, { align: "right" });
  doc.text("Tarief", colRate, y, { align: "right" });
  doc.text("Bedrag", RIGHT, y, { align: "right" });
  y += 4;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(LEFT, y, RIGHT, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  for (const line of invoice.lines) {
    // Tolerate invoices written before quantity/rate existed.
    const quantity = line.quantity ?? 1;
    const unitPrice = line.unitPrice ?? line.amount;
    const wrapped = doc.splitTextToSize(line.description, 90) as string[];
    doc.text(wrapped, LEFT, y);
    doc.text(String(quantity), colQty, y, { align: "right" });
    doc.text(formatEuro(unitPrice), colRate, y, { align: "right" });
    doc.text(formatEuro(line.amount), RIGHT, y, { align: "right" });
    y += Math.max(wrapped.length * 5, 7) + 3;
  }

  y += 2;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.4);
  doc.line(LEFT, y, RIGHT, y);
  y += 9;

  // ---- totals ----
  const vat = invoice.vatAmount ?? 0;
  const subtotal = invoice.lines.reduce((sum, l) => sum + l.amount, 0);
  const totals: [string, string, boolean][] = [
    ["Subtotaal", formatEuro(subtotal), false],
    [vat === 0 ? "Btw (nvt.)" : "Btw", formatEuro(vat), false],
    ["Totaal", formatEuro(invoice.amount), true],
  ];
  for (const [label, value, bold] of totals) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.text(label, colRate, y, { align: "right" });
    doc.text(value, RIGHT, y, { align: "right" });
    y += bold ? 0 : 6.5;
  }

  y += 20;

  // ---- VAT exemption note ----
  if (s.vatNote.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Btw-vermelding", LEFT, y);
    y += 5.5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    const note = doc.splitTextToSize(s.vatNote.trim(), 128) as string[];
    doc.text(note, LEFT, y);
    doc.setTextColor(...INK);
    y += note.length * 5;
  }

  y += 20;

  // ---- footer: contact + payment details ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Contact", LEFT, y);
  doc.text("Betaalgegevens", MID, y);
  y += 6.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);

  const contact = [s.phone, s.email, s.address].filter(Boolean);
  let cy = y;
  for (const line of contact) {
    doc.text(line, LEFT, cy);
    cy += 5;
  }

  let py = y;
  if (s.businessName) {
    doc.text(s.businessName, MID, py);
    py += 5;
  }
  for (const [label, value] of [
    ["IBAN: ", s.iban],
    ["BTW: ", s.vatNumber || s.companyNumber],
  ] as [string, string][]) {
    if (!value) continue;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(label, MID, py);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(value, MID + doc.getTextWidth(label), py);
    py += 5;
  }

  y = Math.max(cy, py) + 6;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(
    `Te betalen binnen ${s.paymentTermDays} dagen met vermelding "${invoice.number}".`,
    LEFT,
    y,
  );

  if (invoice.note) {
    y += 6;
    doc.text(doc.splitTextToSize(invoice.note, 166) as string[], LEFT, y);
  }

  return doc;
}

/** Letter-spaced trade name, standing in for the logo when none is uploaded. */
function wordmark(doc: jsPDF, s: Settings, y: number): number {
  const text = (s.tradeName || s.businessName || "").toUpperCase();
  if (!text) return y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(30);
  let x = LEFT;
  for (const ch of text) {
    doc.text(ch, x, y);
    x += doc.getTextWidth(ch) + 3.2;
  }
  return y;
}

export async function downloadInvoicePdf(invoice: Invoice, s: Settings): Promise<void> {
  const doc = await generateInvoicePdf(invoice, s);
  doc.save(`Factuur ${invoice.number} - ${invoice.recipientName}.pdf`);
}
