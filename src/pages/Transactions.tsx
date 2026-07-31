import { useMemo, useState } from "react";
import { Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import {
  LOCATIONS,
  PRICED_SESSION_TYPES,
  PRODUCTS,
  type Location,
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
            <div key={t.id}>
              <div>
                <div className="item-title">
                  {nameOf(t.clientId)} — {formatEuro(t.amount)}
                </div>
                <div className="item-sub">
                  {formatDateShort(t.date)} · {t.productCode} · {t.creditsBought} credits
                  {t.expiresOn ? ` · vervalt ${formatDateShort(t.expiresOn)}` : ""}
                </div>
              </div>
              <button
                className={`btn-sm ${t.paid ? "" : "btn-primary"}`}
                onClick={() =>
                  db.transactions.update(t.id!, {
                    paid: !t.paid,
                    paidOn: !t.paid ? today() : undefined,
                  })
                }
              >
                {t.paid ? "Betaald" : "Markeer betaald"}
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && <TransactionModal onClose={() => setAdding(false)} />}
    </>
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
          <strong>{price.code}</strong> — {formatEuro(price.amount)} voor {price.credits} credit
          {price.credits === 1 ? "" : "s"}
          {expiresOn ? `, geldig tot ${formatDateShort(expiresOn)}` : ", geen vervaldatum"}.
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
