import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import { completeAppointment, planAppointment, removeRecord } from "../db/actions";
import {
  LOCATIONS,
  SESSION_STATUSES,
  SESSION_TYPES,
  type Appointment,
  type Client,
  type Location,
  type SessionStatus,
  type SessionType,
} from "../db/schema";
import { isChargeable } from "../domain/credits";
import { blockLabel, gridRange, layout, timeOf, toBlocks, type Block } from "../domain/agenda";
import { buildIcs, downloadIcs, upcoming } from "../domain/ics";
import { addDays, formatDateShort, startOfWeek, today } from "../domain/dates";
import { useClients, useSessions, useSettings } from "../hooks/useData";
import { useMediaQuery } from "../hooks/useMediaQuery";

const DAY_SHORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const HOUR_PX = 54;

/**
 * A real week view rather than a list.
 *
 * Wide screens show the full week; a phone shows three days, because seven
 * columns on a phone are four pixels of nothing. The arrows step by whatever
 * is on screen, so paging always moves a full view.
 */
export default function Agenda() {
  const wide = useMediaQuery("(min-width: 900px)");
  const clients = useClients();
  const sessions = useSessions();
  const appointments = useLiveQuery(() => db.appointments.toArray(), []);

  const dayCount = wide ? 7 : 3;
  const [anchor, setAnchor] = useState(() => today());
  const [planning, setPlanning] = useState<{ date: string; time?: string } | null>(null);
  const [open, setOpen] = useState<Block | null>(null);

  // A week starts on Monday; three days simply start where you are.
  const from = wide ? startOfWeek(new Date(anchor)) : anchor;
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(from, i)),
    [from, dayCount],
  );

  const blocks = useMemo(() => {
    if (!appointments) return [];
    const inView = appointments.filter(
      (a) => a.date >= days[0] && a.date <= days[days.length - 1] && a.status === "Gepland",
    );
    return layout(toBlocks(inView));
  }, [appointments, days]);

  const [fromHour, toHour] = gridRange(blocks);

  if (!clients || !sessions || !appointments) return <Empty>Laden…</Empty>;
  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";

  const now = today();
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const gridHeight = hours.length * HOUR_PX;

  // Logged without a planned appointment: no time, so they sit above the grid.
  const untimed = sessions.filter(
    (s) =>
      s.date >= days[0] &&
      s.date <= days[days.length - 1] &&
      !appointments.some((a) => a.sessionId === s.id),
  );

  const overdue = appointments.filter(
    (a) => !a.sessionId && a.status === "Gepland" && a.date < now,
  );

  return (
    <>
      <div className="row-between">
        <h1>Agenda</h1>
        <button className="btn-primary" onClick={() => setPlanning({ date: now })}>
          + Afspraak
        </button>
      </div>

      <div className="monthnav">
        <button aria-label="Vorige" onClick={() => setAnchor(addDays(anchor, -dayCount))}>
          ‹
        </button>
        <div className="monthnav-label">
          <strong>
            {formatDateShort(days[0])} – {formatDateShort(days[days.length - 1])}
          </strong>
          {!days.includes(now) && (
            <button className="btn-sm" onClick={() => setAnchor(today())}>
              Vandaag
            </button>
          )}
        </div>
        <button aria-label="Volgende" onClick={() => setAnchor(addDays(anchor, dayCount))}>
          ›
        </button>
      </div>

      {overdue.length > 0 && (
        <div className="alert crit" style={{ marginBottom: 14 }}>
          {overdue.length} afspraak{overdue.length === 1 ? "" : "en"} uit het verleden staat nog
          open. Vink ze af zodat de credits kloppen.
        </div>
      )}

      <ExportAgenda appointments={appointments} clients={clients} from={now} />

      <div className="agenda" style={{ ["--cols" as string]: dayCount }}>
        {/* Day headings */}
        <div className="agenda-corner" />
        {days.map((d) => (
          <div key={d} className={`agenda-head${d === now ? " is-today" : ""}`}>
            <span className="agenda-day">{DAY_SHORT[(new Date(d).getDay() + 6) % 7]}</span>
            <span className="agenda-date">{Number(d.slice(8))}</span>
          </div>
        ))}

        {/* Untimed strip, only when there is something in it */}
        {untimed.length > 0 && (
          <>
            <div className="agenda-gutter agenda-allday-label">gelogd</div>
            {days.map((d) => (
              <div key={`u-${d}`} className="agenda-allday">
                {untimed
                  .filter((s) => s.date === d)
                  .map((s) => (
                    <div key={s.id} className="agenda-chip" title={nameOf(s.clientId)}>
                      {nameOf(s.clientId).split(" ")[0]}
                    </div>
                  ))}
              </div>
            ))}
          </>
        )}

        {/* Hour gutter */}
        <div className="agenda-gutter" style={{ height: gridHeight }}>
          {hours.map((h) => (
            <div key={h} className="agenda-hour" style={{ height: HOUR_PX }}>
              <span>{String(h).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>

        {/* One column per day */}
        {days.map((d) => (
          <div
            key={`c-${d}`}
            className={`agenda-col${d === now ? " is-today" : ""}`}
            style={{ height: gridHeight }}
          >
            {hours.map((h) => (
              <button
                key={h}
                className="agenda-slot"
                style={{ height: HOUR_PX }}
                onClick={() => setPlanning({ date: d, time: `${String(h).padStart(2, "0")}:00` })}
                aria-label={`Plan op ${d} om ${h}:00`}
              />
            ))}

            {blocks
              .filter((b) => b.date === d)
              .map((b) => {
                const width = 100 / b.columns;
                return (
                  <button
                    key={b.key}
                    className={`agenda-block${b.done ? " is-done" : ""}`}
                    data-type={b.appointments[0].sessionType}
                    style={{
                      top: ((b.start - fromHour * 60) / 60) * HOUR_PX,
                      height: ((b.end - b.start) / 60) * HOUR_PX - 2,
                      left: `${b.column * width}%`,
                      width: `calc(${width}% - 2px)`,
                    }}
                    onClick={() => setOpen(b)}
                  >
                    <span className="agenda-block-time">{timeOf(b.start)}</span>
                    <span className="agenda-block-name">{blockLabel(b, nameOf)}</span>
                    <span className="agenda-block-meta">
                      {b.appointments[0].sessionType} · {b.appointments[0].location}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>

      {blocks.length === 0 && untimed.length === 0 && (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <strong>Niets gepland deze {wide ? "week" : "dagen"}</strong>
          <p>Tik op een uur in de agenda om een afspraak te plannen.</p>
        </div>
      )}

      {planning && (
        <PlanModal date={planning.date} time={planning.time} onClose={() => setPlanning(null)} />
      )}
      {open && <BlockModal block={open} nameOf={nameOf} onClose={() => setOpen(null)} />}
    </>
  );
}

/** The coach's own upcoming schedule, as one calendar file. */
function ExportAgenda({
  appointments,
  clients,
  from,
}: {
  appointments: Appointment[];
  clients: Client[];
  from: string;
}) {
  const settings = useSettings();
  const ahead = upcoming(appointments, from);
  if (!settings || ahead.length === 0) return null;

  function download() {
    const ics = buildIcs(
      ahead.map((a) => ({
        appointment: a,
        clientName: clients.find((c) => c.id === a.clientId)?.name ?? "",
      })),
      settings!,
      "PUBLISH",
    );
    downloadIcs(`agenda-${from}`, ics);
  }

  return (
    <button className="btn-block" style={{ marginBottom: 14 }} onClick={download}>
      Zet {ahead.length} afspra{ahead.length === 1 ? "ak" : "ken"} in mijn agenda (.ics)
    </button>
  );
}

/** What is in this slot, and what can be done with it. */
function BlockModal({
  block,
  nameOf,
  onClose,
}: {
  block: Block;
  nameOf: (id: number) => string;
  onClose: () => void;
}) {
  const settings = useSettings();
  const clients = useClients();
  const [completing, setCompleting] = useState<Appointment | null>(null);

  if (completing) {
    return <CompleteModal appointment={completing} onClose={onClose} />;
  }

  const first = block.appointments[0];

  function invite(a: Appointment) {
    const client = clients?.find((c) => c.id === a.clientId);
    if (!client || !settings) return;
    downloadIcs(
      `afspraak-${client.name.split(" ")[0]}-${a.date}`,
      buildIcs([{ appointment: a, clientName: client.name, clientEmail: client.email }], settings, "REQUEST"),
    );
  }

  return (
    <Modal title={`${timeOf(block.start)} — ${first.sessionType}`} onClose={onClose}>
      <p className="sub">
        {formatDateShort(first.date)} · {first.location} · {first.durationMinutes} minuten
        {first.groupId ? ` · groep ${first.groupId}` : ""}
      </p>

      <div className="list" style={{ marginBottom: 14 }}>
        {block.appointments.map((a) => (
          <div key={a.id}>
            <div>
              <div className="item-title">{nameOf(a.clientId)}</div>
              <div className="item-sub">{a.sessionId ? "Afgevinkt" : "Nog af te vinken"}</div>
            </div>
            <div className="row">
              <button className="btn-sm" onClick={() => invite(a)}>
                Uitnodiging
              </button>
              {!a.sessionId && (
                <button className="btn-sm btn-primary" onClick={() => setCompleting(a)}>
                  Afvinken
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {first.note && <p className="sub">{first.note}</p>}

      <button
        className="btn-block btn-danger"
        onClick={async () => {
          if (!confirm("Deze afspraak verwijderen?")) return;
          for (const a of block.appointments) await removeRecord("appointments", a.id!);
          onClose();
        }}
      >
        Verwijderen
      </button>
      <button className="btn-block" style={{ marginTop: 10 }} onClick={onClose}>
        Sluiten
      </button>
    </Modal>
  );
}

function PlanModal({
  date,
  time,
  onClose,
}: {
  date: string;
  time?: string;
  onClose: () => void;
}) {
  const clients = useClients();
  const [when, setWhen] = useState(date);
  const [startTime, setStartTime] = useState(time ?? "09:00");
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
            : `${picked.length} deelnemers onder één groepsnummer. Elke klant kan apart afzeggen.`}
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
        {isChargeable(status) ? "Dit verbruikt één credit." : "Dit kost geen credit."}
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
