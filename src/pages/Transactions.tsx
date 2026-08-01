import { useMemo, useState } from "react";
import { Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import {
  LOCATIONS,
  PAYMENT_METHODS,
  PRICED_SESSION_TYPES,
  PRODUCTS,
  type Location,
  type PaymentMethod,
  type PricedSessionType,
  type Product,
  type Transaction,
} from "../db/schema";
import { addMonths, formatDateShort, formatEuro, today } from "../domain/dates";
import { findPrice } from "../domain/pricing";
import { useClients, usePrices, useTransactions } from "../hooks/useData";

export default function Transactions() {
  const transactions = useTransactions();
  const clients = useClients();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Transaction | null>(null);

  if (!transactions || !clients) return <Empty>Laden…</Empty>;
  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";

  const outstanding = transactions.filter((t) => !t.paid).reduce((s, t) => s + t.amount, 0);

  return (
    <>
      <div className="row-between">
        <h1>Verkopen</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + Verkoop
        </button>
      </div>
      <p className="sub">
        {transactions.length} verkopen · {formatEuro(outstanding)} openstaand
      </p>

      {transactions.length === 0 ? (
        <Empty>Nog geen verkopen geregistreerd.</Empty>
      ) : (
        <div className="list">
          {transactions.map((t) => (
            <div key={t.id} className={rowTone(t)}>
              <div>
                <div className="item-title">
                  {nameOf(t.clientId)} — {formatEuro(t.amount)}
                </div>
                <div className="item-sub">
                  {formatDateShort(t.date)} · {t.productCode} ·{" "}
                  {t.product === "Losse sessie"
                    ? t.sessionId
                      ? "losse sessie, gegeven"
                      : "losse sessie, nog te geven"
                    : `${t.creditsBought} credits`}
                  {t.expiresOn ? ` · vervalt ${formatDateShort(t.expiresOn)}` : ""}
                </div>
                <div className="item-sub">
                  {t.paid
                    ? `Betaald${t.paymentMethod ? ` · ${t.paymentMethod}` : ""}${t.paidOn ? ` · ${formatDateShort(t.paidOn)}` : ""}`
                    : "Openstaand"}
                  {t.invoiceNeeded && !t.invoiceNumber && " · factuur nog te maken"}
                  {t.invoiceNumber && ` · factuur ${t.invoiceNumber}`}
                </div>
              </div>
              <button
                className={`btn-sm ${t.paid ? "" : "btn-primary"}`}
                onClick={() =>
                  t.paid
                    ? db.transactions.update(t.id!, {
                        paid: false,
                        paidOn: undefined,
                        paymentMethod: undefined,
                      })
                    : setPaying(t)
                }
              >
                {t.paid ? "Betaald" : "Registreer betaling"}
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && <TransactionModal onClose={() => setAdding(false)} />}
      {paying && <PaymentModal transaction={paying} onClose={() => setPaying(null)} />}
    </>
  );
}

/** Row tinting from the spec: open red, paid green, invoice still to make orange. */
function rowTone(t: Transaction): string {
  if (!t.paid) return "tone-open";
  if (t.invoiceNeeded && !t.invoiceNumber) return "tone-todo";
  return "tone-done";
}

function PaymentModal({ transaction, onClose }: { transaction: Transaction; onClose: () => void }) {
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("Bancontact Pay");

  async function save() {
    await db.transactions.update(transaction.id!, { paid: true, paidOn, paymentMethod: method });
    onClose();
  }

  return (
    <Modal title={`Betaling van ${formatEuro(transaction.amount)}`} onClose={onClose}>
      <Field label="Betaald op">
        <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </Field>
      <Field label="Betaalwijze">
        <Select<PaymentMethod> value={method} onChange={setMethod} options={PAYMENT_METHODS} />
      </Field>
      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}

export function TransactionModal({ clientId, onClose }: { clientId?: number; onClose: () => void }) {
  const clients = useClients();
  const prices = usePrices();
  const [date, setDate] = useState(today());
  const [selectedClient, setSelectedClient] = useState(clientId ?? 0);
  const [location, setLocation] = useState<Location>("Privéruimte");
  const [sessionType, setSessionType] = useState<PricedSessionType>("Solo");
  const [product, setProduct] = useState<Product>("Pakket 10");
  const [paid, setPaid] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>("Bancontact Pay");
  const [invoiceNeeded, setInvoiceNeeded] = useState(false);
  const [note, setNote] = useState("");

  const price = useMemo(
    () => (prices ? findPrice(prices, location, sessionType, product) : undefined),
    [prices, location, sessionType, product],
  );

  const expiresOn = price && price.validityMonths > 0 ? addMonths(date, price.validityMonths) : undefined;

  async function save() {
    if (!selectedClient || !price) return;
    const tx: Transaction = {
      date,
      clientId: selectedClient,
      location,
      sessionType,
      product,
      productCode: price.code,
      creditsBought: price.credits,
      amount: price.amount,
      validityMonths: price.validityMonths,
      expiresOn,
      paid,
      paidOn: paid ? today() : undefined,
      paymentMethod: paid ? method : undefined,
      invoiceNeeded,
      note: note || undefined,
    };
    await db.transactions.add(tx);
    onClose();
  }

  return (
    <Modal title="Verkoop registreren" onClose={onClose}>
      {clientId === undefined && (
        <Field label="Klant">
          <select value={selectedClient || ""} onChange={(e) => setSelectedClient(Number(e.target.value))}>
            <option value="">Kies een klant…</option>
            {clients
              ?.filter((c) => c.status !== "Stopgezet")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
      )}

      <Field label="Aankoopdatum">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div className="fields-2">
        <Field label="Locatie">
          <Select<Location> value={location} onChange={setLocation} options={LOCATIONS} />
        </Field>
        <Field label="Type sessie">
          <Select<PricedSessionType> value={sessionType} onChange={setSessionType} options={PRICED_SESSION_TYPES} />
        </Field>
      </div>

      <Field label="Product">
        <Select<Product> value={product} onChange={setProduct} options={PRODUCTS} />
      </Field>

      {price ? (
        <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
          <strong>{price.code}</strong> — {formatEuro(price.amount)}
          {product === "Losse sessie" ? (
            <>
              {" "}
              voor één training. Een losse sessie hoort bij één specifieke training en komt niet in het
              vrije creditsaldo — ze wordt vanzelf gekoppeld zodra je de sessie logt.
            </>
          ) : (
            <>
              {" "}
              voor {price.credits} credits, geldig tot {formatDateShort(expiresOn)}.
            </>
          )}
        </div>
      ) : (
        <div className="alert crit" style={{ marginBottom: 12 }}>
          Geen prijs bekend voor deze combinatie. Voor "{location}" staan er geen producten in de prijstabel.
        </div>
      )}

      <label className="check">
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
        Betaling voltooid
      </label>
      {paid && (
        <Field label="Betaalwijze">
          <Select<PaymentMethod> value={method} onChange={setMethod} options={PAYMENT_METHODS} />
        </Field>
      )}
      <label className="check">
        <input type="checkbox" checked={invoiceNeeded} onChange={(e) => setInvoiceNeeded(e.target.checked)} />
        Factuur nodig
      </label>

      <Field label="Opmerking">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={!selectedClient || !price}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
