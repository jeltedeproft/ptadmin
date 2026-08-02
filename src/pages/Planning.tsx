import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import { completeAppointment, planAppointment, removeRecord } from "../db/actions";
import {
  LOCATIONS,
  SESSION_STATUSES,
  SESSION_TYPES,
  type Appointment,
  type Location,
  type SessionStatus,
  type SessionType,
} from "../db/schema";
import { isChargeable } from "../domain/credits";
import { addDays, formatDateShort, startOfWeek, today } from "../domain/dates";
import { useClients, useSessions } from "../hooks/useData";

const DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

export default function Planning() {
  const sessions = useSessions();
  const clients = useClients();
  const appointments = useLiveQuery(() => db.appointments.toArray(), []);
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [planning, setPlanning] = useState<string | null>(null);
  const [completing, setCompleting] = useState<Appointment | null>(null);

  if (!sessions || !clients || !appointments) return <Empty>Laden…</Empty>;
  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];
  const now = today();

  const planned = appointments.filter(
    (a) => a.date >= weekStart && a.date <= weekEnd && !a.sessionId && a.status === "Gepland",
  );
  const openAhead = appointments.filter((a) => !a.sessionId && a.status === "Gepland" && a.date < now);

  return (
    <>
      <div className="row-between">
        <h1>Planning</h1>
        <button className="btn-primary" onClick={() => setPlanning(now)}>
          + Afspraak
        </button>
      </div>

      <div className="monthnav">
        <button aria-label="Vorige week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ‹
        </button>
        <div className="monthnav-label">
          <strong>
            {formatDateShort(weekStart)} – {formatDateShort(weekEnd)}
          </strong>
          {weekStart !== startOfWeek() && (
            <button className="btn-sm" onClick={() => setWeekStart(startOfWeek())}>
              Deze week
            </button>
          )}
        </div>
        <button aria-label="Volgende week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          ›
        </button>
      </div>

      <p className="sub">{planned.length} afspraken gepland deze week</p>

      {openAhead.length > 0 && (
        <div className="alert crit" style={{ marginBottom: 14 }}>
          {openAhead.length} afspraak{openAhead.length === 1 ? "" : "en"} uit het verleden staat nog
          open. Vink ze af zodat de credits kloppen.
        </div>
      )}

      {days.map((date, i) => {
        const dayPlanned = planned
          .filter((a) => a.date === date)
          .sort((a, b) => a.startTime.localeCompare(b.startTime));
        const dayDone = sessions.filter((s) => s.date === date);

        return (
          <div key={date}>
            <h3 className={date === now ? "day-today" : undefined}>
              {DAYS[i]} {formatDateShort(date)}
              {date === now && " · vandaag"}
            </h3>

            {dayPlanned.length === 0 && dayDone.length === 0 ? (
              <button
                className="btn-sm"
                style={{ marginBottom: 10, opacity: 0.7 }}
                onClick={() => setPlanning(date)}
              >
                + plannen
              </button>
            ) : (
              <div className="list" style={{ marginBottom: 10 }}>
                {dayPlanned.map((a) => (
                  <div key={`a-${a.id}`}>
                    <div>
                      <div className="item-title">
                        {a.startTime} · {nameOf(a.clientId)}
                      </div>
                      <div className="item-sub">
                        {a.sessionType} · {a.location} · {a.durationMinutes} min
                        {a.groupId ? ` · groep ${a.groupId}` : ""}
                      </div>
                    </div>
                    <div className="row">
                      <button className="btn-sm btn-primary" onClick={() => setCompleting(a)}>
                        Afvinken
                      </button>
                      <button
                        className="btn-sm btn-danger"
                        onClick={() => confirm("Afspraak verwijderen?") && removeRecord("appointments", a.id!)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                {dayDone.map((s) => (
                  <Link key={`s-${s.id}`} to={`/coach/klanten/${s.clientId}`}>
                    <div>
                      <div className="item-title">{nameOf(s.clientId)}</div>
                      <div className="item-sub">
                        {s.sessionType} · {s.location} · gelogd
                      </div>
                    </div>
                    <Badge tone={isChargeable(s.status) ? "" : "ok"}>{s.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {planning && <PlanModal date={planning} onClose={() => setPlanning(null)} />}
      {completing && (
        <CompleteModal appointment={completing} onClose={() => setCompleting(null)} />
      )}
    </>
  );
}

function PlanModal({ date, onClose }: { date: string; onClose: () => void }) {
  const clients = useClients();
  const [when, setWhen] = useState(date);
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDuration] = useState(60);
  const [location, setLocation] = useState<Location>("Privéruimte");
  const [sessionType, setSessionType] = useState<SessionType>("Solo");
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function save() {
    if (picked.length === 0) return;
    await planAppointment(
      { date: when, startTime, durationMinutes, location, sessionType, note: note || undefined },
      picked,
    );
    onClose();
  }

  return (
    <Modal title="Afspraak plannen" onClose={onClose}>
      <div className="fields-2">
        <Field label="Datum">
          <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Startuur">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </div>
      <div className="fields-2">
        <Field label="Duur (minuten)">
          <input
            type="number"
            min="15"
            step="15"
            value={durationMinutes}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </Field>
        <Field label="Locatie">
          <Select<Location> value={location} onChange={setLocation} options={LOCATIONS} />
        </Field>
      </div>
      <Field label="Type sessie">
        <Select<SessionType> value={sessionType} onChange={setSessionType} options={SESSION_TYPES} />
      </Field>

      <label>Wie</label>
      <div className="list" style={{ marginBottom: 12 }}>
        {clients
          ?.filter((c) => c.status !== "Stopgezet")
          .map((c) => (
            <label key={c.id} className="check" style={{ margin: 0, padding: "10px 14px" }}>
              <input type="checkbox" checked={picked.includes(c.id!)} onChange={() => toggle(c.id!)} />
              {c.name}
            </label>
          ))}
      </div>

      <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
        {picked.length === 0
          ? "Kies minstens één klant."
          : picked.length === 1
            ? "Plannen kost nog geen credit — dat gebeurt bij het afvinken."
            : `${picked.length} afspraken onder één groepsnummer. Elke klant kan apart afzeggen.`}
      </div>

      <Field label="Notitie">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={picked.length === 0}>
          Plannen
        </button>
      </div>
    </Modal>
  );
}

function CompleteModal({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<SessionStatus>("Uitgevoerd");

  async function save() {
    await completeAppointment(appointment, status);
    onClose();
  }

  return (
    <Modal title="Afspraak afvinken" onClose={onClose}>
      <p className="sub">
        {formatDateShort(appointment.date)} om {appointment.startTime} · {appointment.sessionType}
      </p>
      <Field label="Wat is er gebeurd?">
        <Select<SessionStatus> value={status} onChange={setStatus} options={SESSION_STATUSES} />
      </Field>
      <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
        {isChargeable(status)
          ? "Dit verbruikt één credit."
          : "Dit kost geen credit."}
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
