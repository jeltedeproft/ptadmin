import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import {
  CLIENT_STATUSES,
  LOCATIONS,
  type Client,
  type ClientStatus,
  type Location,
} from "../db/schema";
import { SIGNAL_LABEL } from "../domain/credits";
import { formatDateShort, today } from "../domain/dates";
import { useOverview } from "../hooks/useData";

/** Filters from the coach spec, plus one for anything not active. */
const FILTERS = ["Alle", "Actief", "Intake", "Inactief", "Duo", "Semi PT"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Client cards rather than a table.
 *
 * The spec is explicit about this: a coach scans faces and names, not rows.
 * Each card answers the same four questions — where are they going, when did I
 * last see them, when do I see them next, and is anything wrong.
 */
export default function Clients() {
  const overview = useOverview();
  const appointments = useLiveQuery(() => db.appointments.toArray(), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Alle");
  const [adding, setAdding] = useState(false);

  const now = today();

  const nextByClient = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of appointments ?? []) {
      if (a.sessionId || a.status !== "Gepland" || a.date < now) continue;
      const current = map.get(a.clientId);
      if (!current || a.date < current) map.set(a.clientId, a.date);
    }
    return map;
  }, [appointments, now]);

  if (!overview) return <Empty>Laden…</Empty>;

  const q = query.trim().toLowerCase();
  const filtered = overview
    .filter((o) => (q ? o.client.name.toLowerCase().includes(q) : true))
    .filter((o) => {
      switch (filter) {
        case "Actief":
          return o.client.status === "Actief";
        case "Intake":
          return o.client.status === "Intake";
        case "Inactief":
          return o.client.status === "Gepauzeerd" || o.client.status === "Stopgezet";
        case "Duo":
        case "Semi PT":
          // What they actually train, taken from their purchases.
          return o.ledger.packs.some((p) => p.bucket.endsWith(`|${filter}`));
        default:
          return true;
      }
    });

  return (
    <>
      <div className="row-between">
        <h1>Klanten</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + Klant
        </button>
      </div>
      <p className="sub">
        {overview.filter((o) => o.client.status === "Actief").length} actief ·{" "}
        {overview.filter((o) => o.client.status === "Intake").length} intake
      </p>

      <div className="field">
        <input placeholder="Zoek op naam…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f} className={f === filter ? "on" : ""} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>Geen klanten gevonden</strong>
          <p>Pas de filter aan, of voeg een klant toe.</p>
        </div>
      ) : (
        <div className="cards">
          {filtered.map((o) => {
            const c = o.client;
            const next = nextByClient.get(c.id!);
            return (
              <Link key={c.id} to={`/coach/klanten/${c.id}`} className="clientcard">
                <div className="avatar" aria-hidden="true">
                  {initials(c.name)}
                </div>
                <div className="clientcard-body">
                  <div className="row-between">
                    <span className="item-title">{c.name}</span>
                    <Badge tone={o.signal === "ok" ? "ok" : o.signal}>{SIGNAL_LABEL[o.signal]}</Badge>
                  </div>
                  <div className="item-sub">
                    {age(c.birthDate) ? `${age(c.birthDate)} jaar · ` : ""}
                    {c.status}
                    {c.location ? ` · ${c.location}` : ""}
                  </div>
                  {c.goal && <div className="clientcard-goal">{c.goal}</div>}
                  <div className="clientcard-meta">
                    <span>
                      Laatst: {o.lastSession ? formatDateShort(o.lastSession) : "nog niet"}
                    </span>
                    <span>Volgende: {next ? formatDateShort(next) : "niet gepland"}</span>
                    <span>{o.ledger.available} credits</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {adding && <AddClientModal onClose={() => setAdding(false)} />}
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")).toUpperCase();
}

function age(birthDate?: string): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  const before =
    now.getMonth() < b.getMonth() ||
    (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (before) years--;
  return years >= 0 && years < 130 ? years : null;
}

function AddClientModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<Client>({
    name: "",
    status: "Intake",
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
      <Field label="Doel">
        <input
          placeholder="Waar werkt deze klant naartoe?"
          value={form.goal ?? ""}
          onChange={(e) => set("goal", e.target.value)}
        />
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
      <Field label="Notitie">
        <textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
      </Field>
      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={!form.name.trim()}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
