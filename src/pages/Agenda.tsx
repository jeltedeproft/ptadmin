import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Empty, Field, Modal, Select } from "../components/ui";
import DraggableBlock from "../components/DraggableBlock";
import { db } from "../db/db";
import { completeAppointment, moveGroup, planAppointment, removeRecord } from "../db/actions";
import {
  APPOINTMENT_TYPES,
  LOCATIONS,
  SESSION_STATUSES,
  defaultDuration,
  hasEditableDuration,
  needsClient,
  type Appointment,
  type AppointmentType,
  type Client,
  type Location,
  type SessionStatus,
} from "../db/schema";
import { chargesCredit } from "../domain/credits";
import {
  blockLabel,
  gridRange,
  layout,
  timeOf,
  toBlocks,
  viewRange,
  type AgendaView,
  type Block,
} from "../domain/agenda";
import { buildIcs, downloadIcs, upcoming } from "../domain/ics";
import { addDays, formatDate, formatDateShort, formatMonth, today } from "../domain/dates";
import { useClients, useSessions, useSettings } from "../hooks/useData";

const DAY_SHORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const HOUR_PX = 54;
const VIEWS: AgendaView[] = ["dag", "week", "maand"];

export default function Agenda() {
  const clients = useClients();
  const sessions = useSessions();
  const appointments = useLiveQuery(() => db.appointments.toArray(), []);

  const [view, setView] = useState<AgendaView>("week");
  const [anchor, setAnchor] = useState(() => today());
  const [planning, setPlanning] = useState<{ date: string; time?: string } | null>(null);
  const [open, setOpen] = useState<Block | null>(null);

  const { days, step } = useMemo(() => viewRange(view, anchor), [view, anchor]);

  const blocks = useMemo(() => {
    if (!appointments) return [];
    const inView = appointments.filter(
      (a) => a.date >= days[0] && a.date <= days[days.length - 1] && a.status === "Gepland",
    );
    return layout(toBlocks(inView));
  }, [appointments, days]);

  if (!clients || !sessions || !appointments) return <Empty>Laden…</Empty>;

  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";
  const now = today();

  function shift(direction: 1 | -1) {
    if (view === "maand") {
      const d = new Date(`${anchor}T00:00:00`);
      d.setMonth(d.getMonth() + direction);
      setAnchor(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
    } else {
      setAnchor(addDays(anchor, direction * step));
    }
  }

  async function move(block: Block, date: string) {
    if (date === block.date) return;
    await moveGroup(block.appointments[0], date);
  }

  const overdue = appointments.filter((a) => a.sessionId === undefined && a.status === "Gepland" && a.date < now);

  return (
    <>
      <div className="row-between">
        <h1>Agenda</h1>
        <button className="btn-primary" onClick={() => setPlanning({ date: now })}>
          + Afspraak
        </button>
      </div>

      <div className="chips">
        {VIEWS.map((v) => (
          <button key={v} className={v === view ? "on" : ""} onClick={() => setView(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      <div className="monthnav">
        <button aria-label="Vorige" onClick={() => shift(-1)}>
          ‹
        </button>
        <div className="monthnav-label">
          <strong>
            {view === "dag"
              ? formatDate(days[0])
              : view === "maand"
                ? formatMonth(anchor.slice(0, 7))
                : `${formatDateShort(days[0])} – ${formatDateShort(days[6])}`}
          </strong>
          {!days.includes(now) && (
            <button className="btn-sm" onClick={() => setAnchor(today())}>
              Vandaag
            </button>
          )}
        </div>
        <button aria-label="Volgende" onClick={() => shift(1)}>
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

      {view === "maand" ? (
        <MonthGrid
          days={days}
          blocks={blocks}
          anchorMonth={anchor.slice(0, 7)}
          now={now}
          nameOf={nameOf}
          onOpen={setOpen}
          onMove={move}
          onPlan={(date) => setPlanning({ date })}
        />
      ) : (
        <TimeGrid
          days={days}
          blocks={blocks}
          now={now}
          nameOf={nameOf}
          onOpen={setOpen}
          onMove={move}
          onPlan={(date, time) => setPlanning({ date, time })}
        />
      )}

      {planning && (
        <PlanModal date={planning.date} time={planning.time} onClose={() => setPlanning(null)} />
      )}
      {open && <BlockModal block={open} nameOf={nameOf} onClose={() => setOpen(null)} />}
    </>
  );
}

/* ------------------------------------------------------------ day and week */

function TimeGrid({
  days,
  blocks,
  now,
  nameOf,
  onOpen,
  onMove,
  onPlan,
}: {
  days: string[];
  blocks: Block[];
  now: string;
  nameOf: (id: number) => string;
  onOpen: (b: Block) => void;
  onMove: (b: Block, date: string) => void;
  onPlan: (date: string, time: string) => void;
}) {
  const [fromHour, toHour] = gridRange(blocks);
  const hours = Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i);
  const gridHeight = hours.length * HOUR_PX;

  return (
    <div className="agenda" style={{ ["--cols" as string]: days.length }}>
      <div className="agenda-corner" />
      {days.map((d) => (
        <div key={d} className={`agenda-head${d === now ? " is-today" : ""}`}>
          <span className="agenda-day">{DAY_SHORT[(new Date(d).getDay() + 6) % 7]}</span>
          <span className="agenda-date">{Number(d.slice(8))}</span>
        </div>
      ))}

      <div className="agenda-gutter" style={{ height: gridHeight }}>
        {hours.map((h) => (
          <div key={h} className="agenda-hour" style={{ height: HOUR_PX }}>
            <span>{String(h).padStart(2, "0")}:00</span>
          </div>
        ))}
      </div>

      {days.map((d) => (
        <div
          key={`c-${d}`}
          className={`agenda-col${d === now ? " is-today" : ""}`}
          style={{ height: gridHeight }}
          data-day={d}
        >
          {hours.map((h) => (
            <button
              key={h}
              className="agenda-slot"
              style={{ height: HOUR_PX }}
              onClick={() => onPlan(d, `${String(h).padStart(2, "0")}:00`)}
              aria-label={`Plan op ${d} om ${h}:00`}
            />
          ))}

          {blocks
            .filter((b) => b.date === d)
            .map((b) => {
              const width = 100 / b.columns;
              return (
                <DraggableBlock
                  key={b.key}
                  className={`agenda-block${b.done ? " is-done" : ""}`}
                  data-type={b.appointments[0].sessionType}
                  style={{
                    top: ((b.start - fromHour * 60) / 60) * HOUR_PX,
                    height: ((b.end - b.start) / 60) * HOUR_PX - 2,
                    left: `${b.column * width}%`,
                    width: `calc(${width}% - 2px)`,
                  }}
                  onOpen={() => onOpen(b)}
                  onDropOnDay={(date) => onMove(b, date)}
                >
                  <span className="agenda-block-time">{timeOf(b.start)}</span>
                  <span className="agenda-block-name">{blockLabel(b, nameOf)}</span>
                  <span className="agenda-block-meta">
                    {b.appointments[0].sessionType} · {b.appointments[0].location}
                  </span>
                </DraggableBlock>
              );
            })}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- month */

function MonthGrid({
  days,
  blocks,
  anchorMonth,
  now,
  nameOf,
  onOpen,
  onMove,
  onPlan,
}: {
  days: string[];
  blocks: Block[];
  anchorMonth: string;
  now: string;
  nameOf: (id: number) => string;
  onOpen: (b: Block) => void;
  onMove: (b: Block, date: string) => void;
  onPlan: (date: string) => void;
}) {
  return (
    <div className="month">
      {DAY_SHORT.map((d) => (
        <div key={d} className="month-head">
          {d}
        </div>
      ))}

      {days.map((d) => {
        const dayBlocks = blocks.filter((b) => b.date === d).sort((a, b) => a.start - b.start);
        const outside = d.slice(0, 7) !== anchorMonth;
        return (
          <div
            key={d}
            className={`month-cell${outside ? " is-outside" : ""}${d === now ? " is-today" : ""}`}
            data-day={d}
            onDoubleClick={() => onPlan(d)}
          >
            <div className="month-date">{Number(d.slice(8))}</div>
            {dayBlocks.slice(0, 4).map((b) => (
              <DraggableBlock
                key={b.key}
                className={`month-chip${b.done ? " is-done" : ""}`}
                data-type={b.appointments[0].sessionType}
                onOpen={() => onOpen(b)}
                onDropOnDay={(date) => onMove(b, date)}
              >
                <span className="month-chip-time">{timeOf(b.start)}</span>
                {blockLabel(b, nameOf)}
              </DraggableBlock>
            ))}
            {dayBlocks.length > 4 && (
              <div className="month-more">+{dayBlocks.length - 4} meer</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- shared */

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
        clientName: a.clientId ? (clients.find((c) => c.id === a.clientId)?.name ?? "") : "",
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

  if (completing) return <CompleteModal appointment={completing} onClose={onClose} />;

  const first = block.appointments[0];
  const personal = !needsClient(first.sessionType);

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

      {personal ? (
        <div className="alert" style={{ marginBottom: 14, borderLeftColor: "var(--accent)" }}>
          Persoonlijk blok. Geen klant, geen credit, en het wordt geen sessie.
        </div>
      ) : (
        <div className="list" style={{ marginBottom: 14 }}>
          {block.appointments.map((a) => (
            <div key={a.id}>
              <div>
                <div className="item-title">{a.clientId ? nameOf(a.clientId) : "—"}</div>
                <div className="item-sub">
                  {a.sessionId !== undefined ? "Afgevinkt" : "Nog af te vinken"}
                </div>
              </div>
              <div className="row">
                <button className="btn-sm" onClick={() => invite(a)}>
                  Uitnodiging
                </button>
                {a.sessionId === undefined && (
                  <button className="btn-sm btn-primary" onClick={() => setCompleting(a)}>
                    Afvinken
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {personal && first.sessionId === undefined && (
        <button className="btn-block btn-primary" onClick={() => setCompleting(first)}>
          Afvinken
        </button>
      )}

      {first.note && <p className="sub">{first.note}</p>}

      <button
        className="btn-block btn-danger"
        style={{ marginTop: 10 }}
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

function PlanModal({ date, time, onClose }: { date: string; time?: string; onClose: () => void }) {
  const clients = useClients();
  const [when, setWhen] = useState(date);
  const [startTime, setStartTime] = useState(time ?? "09:00");
  const [location, setLocation] = useState<Location>("Privéruimte");
  const [sessionType, setSessionType] = useState<AppointmentType>("Solo");
  const [duration, setDuration] = useState(defaultDuration("Solo"));
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");

  const personal = !needsClient(sessionType);
  const editableDuration = hasEditableDuration(sessionType);

  function chooseType(t: AppointmentType) {
    setSessionType(t);
    // Duration follows the type; only a personal block keeps whatever is set.
    if (!hasEditableDuration(t)) setDuration(defaultDuration(t));
    if (!needsClient(t)) setPicked([]);
  }

  function toggle(id: number) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const ready = personal || picked.length > 0;

  async function save() {
    if (!ready) return;
    await planAppointment(
      {
        date: when,
        startTime,
        durationMinutes: duration,
        location,
        sessionType,
        note: note || undefined,
      },
      picked,
    );
    onClose();
  }

  return (
    <Modal title="Afspraak plannen" onClose={onClose}>
      <Field label="Type">
        <Select<AppointmentType> value={sessionType} onChange={chooseType} options={APPOINTMENT_TYPES} />
      </Field>

      <div className="fields-2">
        <Field label="Datum">
          <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Startuur">
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </div>

      <div className="fields-2">
        <Field label="Locatie">
          <Select<Location> value={location} onChange={setLocation} options={LOCATIONS} />
        </Field>
        {editableDuration ? (
          <Field label="Duur (minuten)">
            <input
              type="number"
              min="15"
              step="15"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </Field>
        ) : (
          <Field label="Duur">
            <input value={`${duration} minuten`} disabled />
          </Field>
        )}
      </div>

      {!personal && (
        <>
          <label>Wie</label>
          <div className="list" style={{ marginBottom: 12 }}>
            {clients
              ?.filter((c) => c.status !== "Stopgezet")
              .map((c) => (
                <label key={c.id} className="check" style={{ margin: 0, padding: "10px 14px" }}>
                  <input
                    type="checkbox"
                    checked={picked.includes(c.id!)}
                    onChange={() => toggle(c.id!)}
                  />
                  {c.name}
                </label>
              ))}
          </div>
        </>
      )}

      <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
        {personal
          ? "Persoonlijk blok: geen klant, en het wordt geen sessie."
          : sessionType === "Intake"
            ? "Een intake duurt een half uur en kost geen credit."
            : picked.length === 0
              ? "Kies minstens één klant."
              : picked.length === 1
                ? "Plannen kost nog geen credit — dat gebeurt bij het afvinken."
                : `${picked.length} deelnemers onder één groepsnummer.`}
      </div>

      <Field label={personal ? "Waarvoor" : "Notitie"}>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={!ready}>
          Plannen
        </button>
      </div>
    </Modal>
  );
}

function CompleteModal({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const [status, setStatus] = useState<SessionStatus>("Uitgevoerd");
  const personal = !needsClient(appointment.sessionType);

  async function save() {
    await completeAppointment(appointment, status);
    onClose();
  }

  return (
    <Modal title="Afspraak afvinken" onClose={onClose}>
      <p className="sub">
        {formatDateShort(appointment.date)} om {appointment.startTime} · {appointment.sessionType}
      </p>

      {personal ? (
        <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
          Een persoonlijk blok wordt gewoon afgevinkt. Er komt geen sessie van.
        </div>
      ) : (
        <>
          <Field label="Wat is er gebeurd?">
            <Select<SessionStatus> value={status} onChange={setStatus} options={SESSION_STATUSES} />
          </Field>
          <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
            {chargesCredit({ status, sessionType: appointment.sessionType as never })
              ? "Dit verbruikt één credit."
              : appointment.sessionType === "Intake"
                ? "Een intake kost nooit een credit."
                : "Dit kost geen credit."}
          </div>
        </>
      )}

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
