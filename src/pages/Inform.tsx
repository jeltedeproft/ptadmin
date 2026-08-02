import { useState } from "react";
import { Badge, Empty, Field, Modal, Select } from "../components/ui";
import { db, getSettings } from "../db/db";
import { removeRecord } from "../db/actions";
import { INFORM_SESSION_TYPES, type InformEntry, type InformSessionType, type Invoice } from "../db/schema";
import { addDays, formatDateShort, formatEuro, formatMonth, monthKey, today } from "../domain/dates";
import { nextNumber } from "../domain/invoicing";
import { useInform, useSettings } from "../hooks/useData";

export default function Inform() {
  const entries = useInform();
  const settings = useSettings();
  const [adding, setAdding] = useState(false);

  if (!entries || !settings) return <Empty>Laden…</Empty>;

  const byMonth = new Map<string, InformEntry[]>();
  for (const e of entries) {
    const key = monthKey(e.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }
  const months = [...byMonth.keys()].sort().reverse();

  async function invoiceMonth(key: string) {
    const rows = (byMonth.get(key) ?? []).filter((e) => !e.invoiced);
    if (rows.length === 0) return;
    const s = await getSettings();
    const amount = rows.reduce((sum, e) => sum + e.amount, 0);
    const date = today();

    // One line per training type, not per session: "12 uur individuele
    // personal training × €45". Client names stay internal on IN FORM invoices.
    const grouped = new Map<string, { hours: number; rate: number; amount: number }>();
    for (const e of rows) {
      const key = `${e.sessionType}|${e.hourlyRate}`;
      const g = grouped.get(key) ?? { hours: 0, rate: e.hourlyRate, amount: 0 };
      g.hours += e.hours;
      g.amount += e.amount;
      grouped.set(key, g);
    }

    const invoice: Invoice = {
      number: s.nextInvoiceNumber,
      date,
      dueDate: addDays(date, s.paymentTermDays),
      type: "IN FORM",
      recipientName: s.informName,
      recipientAddress: s.informAddress,
      recipientEmail: s.informEmail,
      lines: [...grouped.entries()].map(([key, g]) => ({
        description: `${key.split("|")[0]} — ${formatMonth(monthKey(rows[0].date))}`,
        quantity: g.hours,
        unitPrice: g.rate,
        amount: g.amount,
      })),
      vatAmount: 0,
      amount,
      status: "Concept",
      sourceType: "inform",
      sourceIds: rows.map((e) => e.id!),
    };

    await db.transaction("rw", [db.invoices, db.inform, db.settings], async () => {
      await db.invoices.add(invoice);
      for (const e of rows) {
        await db.inform.update(e.id!, { invoiced: true, invoiceNumber: invoice.number });
      }
      await db.settings.update(1, { nextInvoiceNumber: nextNumber(s.nextInvoiceNumber) });
    });

    alert(`Factuur ${invoice.number} aangemaakt voor ${formatMonth(key)} — ${formatEuro(amount)}.`);
  }

  return (
    <>
      <div className="row-between">
        <h1>IN FORM</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + Uren
        </button>
      </div>
      <p className="sub">Uurwerk voor {settings.informName}, maandelijks gefactureerd.</p>

      {months.length === 0 ? (
        <Empty>Nog geen uren geregistreerd.</Empty>
      ) : (
        months.map((key) => {
          const rows = byMonth.get(key)!;
          const total = rows.reduce((s, e) => s + e.amount, 0);
          const open = rows.filter((e) => !e.invoiced);
          return (
            <div key={key}>
              <h2>
                {formatMonth(key)} — {formatEuro(total)}
              </h2>
              <div className="list">
                {rows.map((e) => (
                  <div key={e.id}>
                    <div>
                      <div className="item-title">
                        {e.sessionType}
                        {e.clientOrGroup ? ` — ${e.clientOrGroup}` : ""}
                      </div>
                      <div className="item-sub">
                        {formatDateShort(e.date)} · {e.hours} u × {formatEuro(e.hourlyRate)} ={" "}
                        {formatEuro(e.amount)}
                      </div>
                    </div>
                    <div className="row">
                      <Badge tone={e.invoiced ? "ok" : "waarschuwing"}>
                        {e.invoiced ? e.invoiceNumber ?? "Gefactureerd" : "Open"}
                      </Badge>
                      {!e.invoiced && (
                        <button
                          className="btn-sm btn-danger"
                          onClick={() => confirm("Verwijderen?") && removeRecord("inform", e.id!)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {open.length > 0 && (
                <button
                  className="btn-block"
                  style={{ marginTop: 10 }}
                  onClick={() => invoiceMonth(key)}
                >
                  Factuur maken voor {formatMonth(key)} ({formatEuro(open.reduce((s, e) => s + e.amount, 0))})
                </button>
              )}
            </div>
          );
        })
      )}

      {adding && <InformModal onClose={() => setAdding(false)} />}
    </>
  );
}

function InformModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const [date, setDate] = useState(today());
  const [sessionType, setSessionType] = useState<InformSessionType>("Solo PT");
  const [clientOrGroup, setClientOrGroup] = useState("");
  const [hours, setHours] = useState("1");
  const [rateOverride, setRateOverride] = useState<string>("");
  const [note, setNote] = useState("");

  const defaultRate = settings?.informRates[sessionType] ?? 0;
  const rate = rateOverride === "" ? defaultRate : Number(rateOverride);
  const amount = (Number(hours) || 0) * rate;

  async function save() {
    if (!hours || amount <= 0) return;
    await db.inform.add({
      date,
      sessionType,
      clientOrGroup: clientOrGroup || undefined,
      hours: Number(hours),
      hourlyRate: rate,
      amount,
      invoiced: false,
      note: note || undefined,
    });
    onClose();
  }

  return (
    <Modal title="IN FORM-uren registreren" onClose={onClose}>
      <Field label="Datum">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Type sessie">
        <Select<InformSessionType>
          value={sessionType}
          onChange={(v) => {
            setSessionType(v);
            setRateOverride("");
          }}
          options={INFORM_SESSION_TYPES}
        />
      </Field>
      <Field label="Klant of groep">
        <input value={clientOrGroup} onChange={(e) => setClientOrGroup(e.target.value)} />
      </Field>
      <div className="fields-2">
        <Field label="Uren">
          <input type="number" step="0.25" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label={`Uurtarief (standaard ${formatEuro(defaultRate)})`}>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={String(defaultRate)}
            value={rateOverride}
            onChange={(e) => setRateOverride(e.target.value)}
          />
        </Field>
      </div>

      <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
        Totaal: <strong>{formatEuro(amount)}</strong>
      </div>

      <Field label="Opmerking">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={amount <= 0}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
