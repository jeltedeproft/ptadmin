import { useState } from "react";
import { Badge, Empty, Field, Modal, Select } from "../components/ui";
import {
  LOCATIONS,
  SESSION_STATUSES,
  SESSION_TYPES,
  type Location,
  type Session,
  type SessionStatus,
  type SessionType,
} from "../db/schema";
import { addGroupSessions, addSession, removeRecord } from "../db/actions";
import { bucketOf, isChargeable, looseAvailableIn } from "../domain/credits";
import { formatDateShort, today } from "../domain/dates";
import { useClients, useOverview, useSessions } from "../hooks/useData";

export default function Sessions() {
  const sessions = useSessions();
  const clients = useClients();
  const [logging, setLogging] = useState(false);
  const [group, setGroup] = useState(false);

  if (!sessions || !clients) return <Empty>Laden…</Empty>;
  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";

  return (
    <>
      <div className="row-between">
        <h1>Sessies</h1>
        <div className="row">
          <button onClick={() => setGroup(true)}>+ Groep</button>
          <button className="btn-primary" onClick={() => setLogging(true)}>
            + Sessie
          </button>
        </div>
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
                  {s.groupId ? ` · groep ${s.groupId}` : ""}
                  {s.note ? ` · ${s.note}` : ""}
                </div>
              </div>
              <div className="row">
                <Badge tone={isChargeable(s.status) ? "" : "ok"}>{s.status}</Badge>
                <button
                  className="btn-sm btn-danger"
                  onClick={() => confirm("Sessie verwijderen?") && removeRecord("sessions", s.id!)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {logging && <SessionModal onClose={() => setLogging(false)} />}
      {group && <GroupSessionModal onClose={() => setGroup(false)} />}
    </>
  );
}

/** One shared training logged as a session per participant (spec §9, §20). */
function GroupSessionModal({ onClose }: { onClose: () => void }) {
  const clients = useClients();
  const [date, setDate] = useState(today());
  const [location, setLocation] = useState<Location>("Privéruimte");
  const [sessionType, setSessionType] = useState<SessionType>("Duo");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Map<number, SessionStatus>>(new Map());
  const [saving, setSaving] = useState(false);

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, "Uitgevoerd");
      return next;
    });
  }

  function setStatus(id: number, status: SessionStatus) {
    setPicked((prev) => new Map(prev).set(id, status));
  }

  async function save() {
    if (picked.size < 2) return;
    setSaving(true);
    const participants = [...picked.entries()].map(([clientId, status]) => ({ clientId, status }));
    await addGroupSessions({ date, location, sessionType, note: note || undefined }, participants);
    onClose();
  }

  return (
    <Modal title="Groepstraining loggen" onClose={onClose}>
      <Field label="Datum">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="fields-2">
        <Field label="Locatie">
          <Select<Location> value={location} onChange={setLocation} options={LOCATIONS} />
        </Field>
        <Field label="Type sessie">
          <Select<SessionType> value={sessionType} onChange={setSessionType} options={SESSION_TYPES} />
        </Field>
      </div>

      <label>Deelnemers</label>
      <div className="list" style={{ marginBottom: 12 }}>
        {clients
          ?.filter((c) => c.status !== "Stopgezet")
          .map((c) => {
            const status = picked.get(c.id!);
            return (
              <div key={c.id}>
                <label className="check" style={{ margin: 0, flex: 1 }}>
                  <input type="checkbox" checked={status !== undefined} onChange={() => toggle(c.id!)} />
                  {c.name}
                </label>
                {status !== undefined && (
                  <select
                    value={status}
                    style={{ width: "auto", maxWidth: 170 }}
                    onChange={(e) => setStatus(c.id!, e.target.value as SessionStatus)}
                  >
                    {SESSION_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
      </div>

      <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
        {picked.size < 2
          ? "Kies minstens twee deelnemers."
          : `${picked.size} sessies worden aangemaakt onder één groepsnummer. Elke deelnemer verbruikt zijn eigen credit.`}
      </div>

      <Field label="Notitie">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={picked.size < 2 || saving}>
          Opslaan
        </button>
      </div>
    </Modal>
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
    await addSession(form);
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
