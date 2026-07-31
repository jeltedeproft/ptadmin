import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import { CLIENT_STATUSES, LOCATIONS, type Client, type ClientStatus, type Location } from "../db/schema";
import { SIGNAL_LABEL } from "../domain/credits";
import { today } from "../domain/dates";
import { useOverview } from "../hooks/useData";

export default function Clients() {
  const overview = useOverview();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  if (!overview) return <Empty>Laden…</Empty>;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? overview.filter((o) => o.client.name.toLowerCase().includes(q))
    : overview;

  const active = filtered.filter((o) => o.client.status === "Actief");
  const rest = filtered.filter((o) => o.client.status !== "Actief");

  return (
    <>
      <div className="row-between">
        <h1>Klanten</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + Klant
        </button>
      </div>
      <p className="sub">
        {active.length} actief · {rest.length} gepauzeerd of stopgezet
      </p>

      <div className="field">
        <input placeholder="Zoek op naam…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <Empty>Geen klanten gevonden.</Empty>
      ) : (
        <div className="list">
          {[...active, ...rest].map((o) => (
            <Link key={o.client.id} to={`/klanten/${o.client.id}`}>
              <div>
                <div className="item-title">{o.client.name}</div>
                <div className="item-sub">
                  {o.client.location} · {o.ledger.available} credits
                  {o.client.status !== "Actief" && ` · ${o.client.status}`}
                </div>
              </div>
              <Badge tone={o.signal === "ok" ? "ok" : o.signal}>{SIGNAL_LABEL[o.signal]}</Badge>
            </Link>
          ))}
        </div>
      )}

      {adding && <AddClientModal onClose={() => setAdding(false)} />}
    </>
  );
}

function AddClientModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Client>({
    name: "",
    status: "Actief",
    startDate: today(),
    location: "Privéruimte",
  });

  const set = <K extends keyof Client>(k: K, v: Client[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return;
    await db.clients.add({ ...form, name: form.name.trim() });
    onClose();
  }

  return (
    <Modal title="Nieuwe klant" onClose={onClose}>
      <Field label="Naam">
        <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} />
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
        <Field label="Startdatum">
          <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Geboortedatum">
          <input type="date" value={form.birthDate ?? ""} onChange={(e) => set("birthDate", e.target.value)} />
        </Field>
      </div>
      <Field label="E-mail">
        <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Telefoon">
        <input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="Facturatieadres">
        <input value={form.billingAddress ?? ""} onChange={(e) => set("billingAddress", e.target.value)} />
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
