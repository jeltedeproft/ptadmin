import { useState } from "react";
import { Badge, Empty, Modal, Select } from "../components/ui";
import { db, getSettings } from "../db/db";
import { removeRecord } from "../db/actions";
import { INVOICE_STATUSES, type Invoice, type InvoiceStatus } from "../db/schema";
import { addDays, formatDateShort, formatEuro, today } from "../domain/dates";
import { downloadInvoicePdf, nextNumber } from "../domain/invoicing";
import { useClients, useInvoices, useSettings, useTransactions } from "../hooks/useData";

export default function Invoices() {
  const invoices = useInvoices();
  const transactions = useTransactions();
  const clients = useClients();
  const settings = useSettings();
  const [open, setOpen] = useState<Invoice | null>(null);

  if (!invoices || !transactions || !clients || !settings) return <Empty>Laden…</Empty>;

  // Sales flagged "factuur nodig" that have not been turned into an invoice yet.
  const pending = transactions.filter((t) => t.invoiceNeeded && !t.invoiceNumber);

  async function invoiceTransaction(transactionId: number) {
    const t = transactions!.find((x) => x.id === transactionId)!;
    const client = clients!.find((c) => c.id === t.clientId);
    const s = await getSettings();
    const date = today();

    const invoice: Invoice = {
      number: s.nextInvoiceNumber,
      date,
      dueDate: addDays(date, s.paymentTermDays),
      type: "Eigen klant",
      clientId: t.clientId,
      // The client's name must appear on every invoice; billingName covers the
      // case where it is addressed to their company instead.
      recipientName: client?.billingName?.trim() || client?.name || "Onbekend",
      recipientAddress: client?.billingAddress,
      recipientEmail: client?.email,
      lines: [
        {
          description: `${t.product} — ${t.sessionType}, ${t.location} (${t.creditsBought} sessie${t.creditsBought === 1 ? "" : "s"})`,
          quantity: 1,
          unitPrice: t.amount,
          amount: t.amount,
        },
      ],
      vatAmount: 0,
      amount: t.amount,
      status: "Concept",
      sourceType: "transaction",
      sourceIds: [t.id!],
    };

    await db.transaction("rw", [db.invoices, db.transactions, db.settings], async () => {
      await db.invoices.add(invoice);
      await db.transactions.update(t.id!, { invoiceNumber: invoice.number });
      await db.settings.update(1, { nextInvoiceNumber: nextNumber(s.nextInvoiceNumber) });
    });
  }

  const unpaidTotal = invoices
    .filter((i) => i.status !== "Betaald" && i.status !== "Geannuleerd")
    .reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <h1>Facturen</h1>
      <p className="sub">
        {invoices.length} facturen · {formatEuro(unpaidTotal)} openstaand
      </p>

      {pending.length > 0 && (
        <>
          <h2>Nog te factureren</h2>
          <div className="list">
            {pending.map((t) => (
              <div key={t.id}>
                <div>
                  <div className="item-title">
                    {clients.find((c) => c.id === t.clientId)?.name} — {formatEuro(t.amount)}
                  </div>
                  <div className="item-sub">
                    {formatDateShort(t.date)} · {t.productCode}
                  </div>
                </div>
                <button className="btn-sm btn-primary" onClick={() => invoiceTransaction(t.id!)}>
                  Factuur maken
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Overzicht</h2>
      {invoices.length === 0 ? (
        <Empty>
          Nog geen facturen. Vink "factuur nodig" aan bij een verkoop, of maak er één vanuit IN FORM.
        </Empty>
      ) : (
        <div className="list">
          {invoices.map((i) => (
            <button key={i.id} onClick={() => setOpen(i)}>
              <div>
                <div className="item-title">
                  {i.number} — {formatEuro(i.amount)}
                </div>
                <div className="item-sub">
                  {i.recipientName} · {formatDateShort(i.date)} · vervalt {formatDateShort(i.dueDate)}
                </div>
              </div>
              <Badge tone={statusTone(i, today())}>{i.status}</Badge>
            </button>
          ))}
        </div>
      )}

      {open && <InvoiceModal invoice={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function statusTone(i: Invoice, now: string): string {
  if (i.status === "Betaald") return "ok";
  if (i.status === "Geannuleerd") return "";
  if (i.dueDate < now) return "kritiek";
  return "waarschuwing";
}

function InvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const settings = useSettings();
  const [status, setStatus] = useState<InvoiceStatus>(invoice.status);

  async function apply(next: InvoiceStatus) {
    setStatus(next);
    await db.invoices.update(invoice.id!, {
      status: next,
      paidOn: next === "Betaald" ? today() : undefined,
    });
  }

  async function remove() {
    if (!confirm(`Factuur ${invoice.number} verwijderen?`)) return;
    await removeRecord("invoices", invoice.id!);
    await db.transaction("rw", [db.inform, db.transactions], async () => {
      // Release the source records so they can be invoiced again.
      if (invoice.sourceType === "inform") {
        for (const id of invoice.sourceIds) {
          await db.inform.update(id, { invoiced: false, invoiceNumber: undefined });
        }
      } else {
        for (const id of invoice.sourceIds) {
          await db.transactions.update(id, { invoiceNumber: undefined });
        }
      }
    });
    onClose();
  }

  return (
    <Modal title={`Factuur ${invoice.number}`} onClose={onClose}>
      <div className="stack" style={{ marginBottom: 16 }}>
        <div className="row-between">
          <span className="muted">Aan</span>
          <span>{invoice.recipientName}</span>
        </div>
        <div className="row-between">
          <span className="muted">Datum</span>
          <span>{formatDateShort(invoice.date)}</span>
        </div>
        <div className="row-between">
          <span className="muted">Vervaldatum</span>
          <span>{formatDateShort(invoice.dueDate)}</span>
        </div>
        <div className="row-between">
          <span className="muted">Bedrag</span>
          <strong>{formatEuro(invoice.amount)}</strong>
        </div>
      </div>

      <div className="list" style={{ marginBottom: 16 }}>
        {invoice.lines.map((l, idx) => (
          <div key={idx}>
            <div>
              <div className="item-sub" style={{ marginTop: 0 }}>
                {l.description}
              </div>
              <div className="item-sub">
                {l.quantity} × {formatEuro(l.unitPrice)}
              </div>
            </div>
            <span>{formatEuro(l.amount)}</span>
          </div>
        ))}
      </div>

      <label>Status</label>
      <Select<InvoiceStatus> value={status} onChange={apply} options={INVOICE_STATUSES} />

      <div className="modal-actions">
        <button onClick={remove} className="btn-danger">
          Verwijder
        </button>
        <button
          className="btn-primary"
          onClick={() => settings && downloadInvoicePdf({ ...invoice, status }, settings)}
        >
          Download PDF
        </button>
      </div>
      <button className="btn-block" style={{ marginTop: 10 }} onClick={onClose}>
        Sluiten
      </button>
    </Modal>
  );
}
