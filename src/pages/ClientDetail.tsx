import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Card, Empty, Field, Kpi, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import {
  CLIENT_STATUSES,
  LOCATIONS,
  type Client,
  type ClientStatus,
  type Location,
} from "../db/schema";
import { isChargeable, SIGNAL_LABEL } from "../domain/credits";
import { formatDateShort, formatEuro } from "../domain/dates";
import { useClientOverview } from "../hooks/useData";
import { SessionModal } from "./Sessions";
import { TransactionModal } from "./Transactions";

export default function ClientDetail() {
  const { id } = useParams();
  const clientId = Number(id);
  const navigate = useNavigate();
  const overview = useClientOverview(clientId);
  const [editing, setEditing] = useState(false);
  const [loggingSession, setLoggingSession] = useState(false);
  const [addingSale, setAddingSale] = useState(false);

  const sessions = useLiveQuery(
    () => db.sessions.where("clientId").equals(clientId).reverse().sortBy("date"),
    [clientId],
  );
  const transactions = useLiveQuery(
    () => db.transactions.where("clientId").equals(clientId).reverse().sortBy("date"),
    [clientId],
  );

  if (!overview || !sessions || !transactions) return <Empty>Laden…</Empty>;
  const { client, ledger, signal, lastSession } = overview;

  async function remove() {
    if (!confirm(`${client.name} en alle bijhorende sessies en verkopen verwijderen?`)) return;
    await db.transaction("rw", [db.clients, db.sessions, db.transactions], async () => {
      await db.clients.delete(clientId);
      await db.sessions.where("clientId").equals(clientId).delete();
      await db.transactions.where("clientId").equals(clientId).delete();
    });
    navigate("/klanten");
  }

  return (
    <>
      <div className="row-between">
        <h1>{client.name}</h1>
        <Badge tone={signal === "ok" ? "ok" : signal}>{SIGNAL_LABEL[signal]}</Badge>
      </div>
      <p className="sub">
        {client.status} · {client.location} · klant sinds {formatDateShort(client.startDate)}
      </p>

      <div className="row" style={{ marginBottom: 18 }}>
        <button className="btn-primary" onClick={() => setLoggingSession(true)}>
          Sessie loggen
        </button>
        <button onClick={() => setAddingSale(true)}>Verkoop</button>
        <button onClick={() => setEditing(true)}>Bewerk</button>
      </div>

      <div className="grid">
        <Kpi label="Credits over" value={ledger.available} />
        <Kpi label="Sessies gedaan" value={sessions.filter((s) => isChargeable(s.status)).length} />
        <Kpi label="Vervalt op" value={formatDateShort(ledger.nextExpiry)} small />
        <Kpi label="Laatste sessie" value={formatDateShort(lastSession)} small />
      </div>

      {ledger.looseUnused > 0 && (
        <div className="alert" style={{ marginTop: 12, borderLeftColor: "var(--accent)" }}>
          {ledger.looseUnused} losse sessie{ledger.looseUnused === 1 ? "" : "s"} betaald en nog niet
          gegeven. Losse sessies tellen niet mee in het creditsaldo — ze horen bij één specifieke training.
        </div>
      )}

      {ledger.forfeited > 0 && (
        <div className="alert crit" style={{ marginTop: 12 }}>
          {ledger.forfeited} credit{ledger.forfeited === 1 ? "" : "s"} vervallen zonder gebruikt te zijn.
        </div>
      )}
      {ledger.uncoveredSessionIds.length > 0 && (
        <div className="alert" style={{ marginTop: 12 }}>
          {ledger.uncoveredSessionIds.length} sessie{ledger.uncoveredSessionIds.length === 1 ? "" : "s"} zonder
          dekkend pakket — nog te factureren of een verkoop ontbreekt.
        </div>
      )}

      {(client.email || client.phone) && (
        <Card className="stack">
          {client.email && (
            <div className="row-between">
              <span className="muted">E-mail</span>
              <a href={`mailto:${client.email}`}>{client.email}</a>
            </div>
          )}
          {client.phone && (
            <div className="row-between">
              <span className="muted">Telefoon</span>
              <a href={`tel:${client.phone.replace(/\s/g, "")}`}>{client.phone}</a>
            </div>
          )}
        </Card>
      )}

      <h2>Pakketten</h2>
      {ledger.packs.length === 0 ? (
        <Empty>Nog geen pakketten gekocht.</Empty>
      ) : (
        <div className="list">
          {ledger.packs
            .slice()
            .reverse()
            .map((p) => {
              const t = transactions.find((x) => x.id === p.transactionId);
              return (
                <div key={p.transactionId}>
                  <div>
                    <div className="item-title">
                      {t?.product} · {t?.sessionType} · {t?.location}
                    </div>
                    <div className="item-sub">
                      {formatDateShort(p.date)} · {formatEuro(t?.amount ?? 0)} ·{" "}
                      {p.expiresOn ? `vervalt ${formatDateShort(p.expiresOn)}` : "geen vervaldatum"}
                    </div>
                  </div>
                  <Badge tone={p.expiredUnused ? "verlopen" : p.remaining === 0 ? "" : "ok"}>
                    {p.remaining}/{p.bought}
                  </Badge>
                </div>
              );
            })}
        </div>
      )}

      {ledger.looseSales.length > 0 && (
        <>
          <h2>Losse sessies</h2>
          <div className="list">
            {ledger.looseSales
              .slice()
              .reverse()
              .map((l) => {
                const t = transactions.find((x) => x.id === l.transactionId);
                return (
                  <div key={l.transactionId}>
                    <div>
                      <div className="item-title">
                        {t?.sessionType} · {t?.location}
                      </div>
                      <div className="item-sub">
                        {formatDateShort(l.date)} · {formatEuro(t?.amount ?? 0)}
                      </div>
                    </div>
                    <Badge tone={l.usedBySessionId ? "" : "ok"}>
                      {l.usedBySessionId ? "Gegeven" : "Nog te geven"}
                    </Badge>
                  </div>
                );
              })}
          </div>
        </>
      )}

      <h2>Sessies</h2>
      {sessions.length === 0 ? (
        <Empty>Nog geen sessies gelogd.</Empty>
      ) : (
        <div className="list">
          {sessions.slice(0, 25).map((s) => (
            <div key={s.id}>
              <div>
                <div className="item-title">{formatDateShort(s.date)}</div>
                <div className="item-sub">
                  {s.sessionType} · {s.location}
                  {s.groupId ? ` · groep ${s.groupId}` : ""}
                  {s.note ? ` · ${s.note}` : ""}
                </div>
              </div>
              <Badge tone={isChargeable(s.status) ? "" : "ok"}>{s.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <h2>Gevaarlijke zone</h2>
      <button className="btn-danger btn-block" onClick={remove}>
        Klant verwijderen
      </button>

      {editing && <EditClientModal client={client} onClose={() => setEditing(false)} />}
      {loggingSession && <SessionModal clientId={clientId} onClose={() => setLoggingSession(false)} />}
      {addingSale && <TransactionModal clientId={clientId} onClose={() => setAddingSale(false)} />}
    </>
  );
}

function EditClientModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [form, setForm] = useState<Client>(client);
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    await db.clients.update(client.id!, form);
    onClose();
  }

  return (
    <Modal title="Klant bewerken" onClose={onClose}>
      <Field label="Naam">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="fields-2">
        <Field label="Status">
          <Select<ClientStatus> value={form.status} onChange={(v) => set("status", v)} options={CLIENT_STATUSES} />
        </Field>
        <Field label="Locatie">
          <Select<Location> value={form.location} onChange={(v) => set("location", v)} options={LOCATIONS} />
        </Field>
      </div>
      <div className="fields-2">
        <Field label="Laatste evaluatie">
          <input type="date" value={form.lastEvaluation ?? ""} onChange={(e) => set("lastEvaluation", e.target.value)} />
        </Field>
        <Field label="Volgende evaluatie">
          <input type="date" value={form.nextEvaluation ?? ""} onChange={(e) => set("nextEvaluation", e.target.value)} />
        </Field>
      </div>
      <Field label="E-mail">
        <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Telefoon">
        <input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="Facturatienaam (indien anders dan de klant)">
        <input
          placeholder={form.name}
          value={form.billingName ?? ""}
          onChange={(e) => set("billingName", e.target.value)}
        />
      </Field>
      <Field label="Facturatieadres">
        <textarea
          placeholder={"Straat 1\n2000 Stad\nBelgië"}
          value={form.billingAddress ?? ""}
          onChange={(e) => set("billingAddress", e.target.value)}
        />
      </Field>
      <Field label="Ondernemingsnummer">
        <input value={form.companyNumber ?? ""} onChange={(e) => set("companyNumber", e.target.value)} />
      </Field>
      <Field label="Notitie">
        <textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
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
