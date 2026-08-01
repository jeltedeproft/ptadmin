import { useState } from "react";
import { Badge, Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import {
  LOCATIONS,
  SESSION_STATUSES,
  SESSION_TYPES,
  type Location,
  type Session,
  type SessionStatus,
  type SessionType,
} from "../db/schema";
import { bucketOf, isChargeable, isLooseSale, looseAvailableIn } from "../domain/credits";
import { formatDateShort, today } from "../domain/dates";
import { useClients, useOverview, useSessions } from "../hooks/useData";

export default function Sessions() {
  const sessions = useSessions();
  const clients = useClients();
  const [logging, setLogging] = useState(false);

  if (!sessions || !clients) return <Empty>Laden…</Empty>;
  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";

  return (
    <>
      <div className="row-between">
        <h1>Sessies</h1>
        <button className="btn-primary" onClick={() => setLogging(true)}>
          + Sessie
        </button>
      </div>
      <p className="sub">{sessions.length} gelogd</p>

      {sessions.length === 0 ? (
        <Empty>Nog niets gelogd. Log je eerste sessie na de training.</Empty>
      ) : (
        <div className="list">
          {sessions.map((s) => (
            <div key={s.id}>
              <div>
                <div className="item-title">{nameOf(s.clientId)}</div>
                <div className="item-sub">
                  {formatDateShort(s.date)} · {s.sessionType} · {s.location}
                  {s.note ? ` · ${s.note}` : ""}
                </div>
              </div>
              <div className="row">
                <Badge tone={isChargeable(s.status) ? "" : "ok"}>{s.status}</Badge>
                <button
                  className="btn-sm btn-danger"
                  onClick={() => confirm("Sessie verwijderen?") && db.sessions.delete(s.id!)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {logging && <SessionModal onClose={() => setLogging(false)} />}
    </>
  );
}

export function SessionModal({ clientId, onClose }: { clientId?: number; onClose: () => void }) {
  const clients = useClients();
  const overview = useOverview();
  const [form, setForm] = useState<Session>({
    date: today(),
    clientId: clientId ?? 0,
    location: "Privéruimte",
    sessionType: "Solo",
    status: "Uitgevoerd",
  });

  const set = <K extends keyof Session>(k: K, v: Session[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Prefill location from the client's default the first time one is chosen.
  function chooseClient(id: number) {
    const client = clients?.find((c) => c.id === id);
    setForm((f) => ({ ...f, clientId: id, location: client?.location ?? f.location }));
  }

  const selected = overview?.find((o) => o.client.id === form.clientId);
  const bucket = bucketOf(form.location, form.sessionType);
  const availableHere = selected?.ledger.availableByBucket.get(bucket) ?? 0;
  const looseHere = selected ? looseAvailableIn(selected.ledger, bucket) : 0;
  const willCharge = isChargeable(form.status);

  async function save() {
    if (!form.clientId) return;
    await db.transaction("rw", [db.sessions, db.transactions], async () => {
      const sessionId = await db.sessions.add(form);
      if (!isChargeable(form.status) || availableHere > 0) return;

      // Mogelijkheid B: a losse sessie pays for one specific session, so book
      // it against this one rather than leaving it floating as free credit.
      const candidates = await db.transactions.where("clientId").equals(form.clientId).toArray();
      const loose = candidates
        .filter(
          (t) =>
            isLooseSale(t) &&
            !t.sessionId &&
            t.date <= form.date &&
            bucketOf(t.location, t.sessionType) === bucket,
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (loose) await db.transactions.update(loose.id!, { sessionId });
    });
    onClose();
  }

  return (
    <Modal title="Sessie loggen" onClose={onClose}>
      {clientId === undefined && (
        <Field label="Klant">
          <select value={form.clientId || ""} onChange={(e) => chooseClient(Number(e.target.value))}>
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

      <Field label="Datum">
        <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
      </Field>

      <div className="fields-2">
        <Field label="Locatie">
          <Select<Location> value={form.location} onChange={(v) => set("location", v)} options={LOCATIONS} />
        </Field>
        <Field label="Type sessie">
          <Select<SessionType> value={form.sessionType} onChange={(v) => set("sessionType", v)} options={SESSION_TYPES} />
        </Field>
      </div>

      <Field label="Status">
        <Select<SessionStatus> value={form.status} onChange={(v) => set("status", v)} options={SESSION_STATUSES} />
      </Field>

      {form.clientId > 0 && (
        <div
          className={`alert${willCharge && availableHere === 0 && looseHere === 0 ? " crit" : ""}`}
          style={{ marginBottom: 12 }}
        >
          {!willCharge ? (
            <>Deze status kost geen credit.</>
          ) : availableHere > 0 ? (
            <>
              Kost 1 credit · {availableHere} beschikbaar voor {form.sessionType} / {form.location} →{" "}
              {availableHere - 1} over.
            </>
          ) : looseHere > 0 ? (
            <>
              Gedekt door een betaalde losse sessie · daarna nog {looseHere - 1} losse sessie
              {looseHere - 1 === 1 ? "" : "s"} tegoed.
            </>
          ) : (
            <>
              Geen credits voor {form.sessionType} / {form.location}. De sessie wordt gelogd maar blijft
              gemarkeerd als niet gedekt.
            </>
          )}
        </div>
      )}

      <Field label="Notitie">
        <textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
      </Field>

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={!form.clientId}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
