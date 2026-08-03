import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Empty } from "../components/ui";
import { db } from "../db/db";
import { completeAppointment } from "../db/actions";
import { SESSION_STATUSES, type Appointment, type SessionStatus } from "../db/schema";
import { Field, Modal, Select } from "../components/ui";
import { isChargeable } from "../domain/credits";
import { blockLabel, layout, timeOf, toBlocks, type Block } from "../domain/agenda";
import { addDays, daysUntilBirthday, formatDate, formatDateShort, today } from "../domain/dates";
import { useClients, useOverview, useSessions, useSettings } from "../hooks/useData";

/**
 * The coach's command centre.
 *
 * Opening the app should answer "what needs me today", not show numbers. So:
 * the day itself first, then the handful of things that need doing, and
 * nothing else. Money lives in the business world and deliberately stays out
 * of here.
 */
export default function CoachHome() {
  const clients = useClients();
  const overview = useOverview();
  const sessions = useSessions();
  const settings = useSettings();
  const appointments = useLiveQuery(() => db.appointments.toArray(), []);
  const [completing, setCompleting] = useState<Appointment | null>(null);

  const now = today();

  const dayBlocks = useMemo(() => {
    if (!appointments) return [];
    return layout(toBlocks(appointments.filter((a) => a.date === now && a.status === "Gepland")));
  }, [appointments, now]);

  if (!clients || !overview || !sessions || !settings || !appointments) return <Empty>Laden…</Empty>;

  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";
  const open = dayBlocks.filter((b) => !b.done);
  const next = open.find((b) => b.start >= new Date().getHours() * 60 + new Date().getMinutes());

  const intakes = clients.filter((c) => c.status === "Intake");
  const cancelled = appointments.filter((a) => a.date === now && a.status === "Afgezegd");

  return (
    <>
      <h1>{greeting()} {settings.tradeName || settings.businessName || ""}</h1>
      <p className="sub">{formatDate(now)}</p>

      <div className="grid">
        <Tile label="Sessies vandaag" value={dayBlocks.length} />
        <Tile label="Nog af te werken" value={open.length} />
        <Tile
          label="Eerstvolgende"
          value={next ? timeOf(next.start) : dayBlocks.length ? "klaar" : "—"}
        />
        <Tile label="Intakes" value={intakes.length} />
      </div>

      {cancelled.length > 0 && (
        <div className="alert" style={{ marginTop: 12 }}>
          {cancelled.length} afspraak{cancelled.length === 1 ? "" : "en"} vandaag afgezegd.
        </div>
      )}

      <h2>Mijn dag</h2>
      {dayBlocks.length === 0 ? (
        <div className="empty-state">
          <strong>Niets gepland vandaag</strong>
          <p>Plan een afspraak in de agenda, of geniet ervan.</p>
          <Link className="btn" to="/coach/agenda">
            Agenda openen
          </Link>
        </div>
      ) : (
        <div className="list">
          {dayBlocks.map((b) => (
            <div key={b.key} className={b.done ? "" : "tone-todo"}>
              <div>
                <div className="item-title">
                  {timeOf(b.start)} · {blockLabel(b, nameOf)}
                </div>
                <div className="item-sub">
                  {b.appointments[0].sessionType} · {b.appointments[0].location} ·{" "}
                  {b.appointments[0].durationMinutes} min
                </div>
                {b.appointments[0].note && (
                  <div className="item-sub">{b.appointments[0].note}</div>
                )}
              </div>
              <div className="row">
                <Link className="btn btn-sm" to={`/coach/klanten/${b.appointments[0].clientId}`}>
                  Klant
                </Link>
                {b.done ? (
                  <Badge tone="ok">Afgerond</Badge>
                ) : (
                  <button
                    className="btn-sm btn-primary"
                    onClick={() => setCompleting(b.appointments[0])}
                  >
                    Afronden
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Acties</h2>
      <Actions
        overview={overview}
        clients={clients}
        appointments={appointments}
        sessions={sessions}
        inactiveDays={settings.inactiveDays}
        evaluationDays={settings.evaluationLookaheadDays}
        now={now}
      />

      {completing && (
        <CompleteModal appointment={completing} onClose={() => setCompleting(null)} />
      )}
    </>
  );
}

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 6) return "Goedenacht";
  if (h < 12) return "Goeiemorgen";
  if (h < 18) return "Goeiemiddag";
  return "Goeieavond";
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card kpi kpi-lg">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

/**
 * The tasks the coach spec asks for, generated rather than typed: an evaluation
 * due, an intake to prepare, someone not seen in a while, a pack running out, a
 * birthday. Only things with a next step attached.
 */
function Actions({
  overview,
  clients,
  appointments,
  sessions,
  inactiveDays,
  evaluationDays,
  now,
}: {
  overview: NonNullable<ReturnType<typeof useOverview>>;
  clients: NonNullable<ReturnType<typeof useClients>>;
  appointments: Appointment[];
  sessions: NonNullable<ReturnType<typeof useSessions>>;
  inactiveDays: number;
  evaluationDays: number;
  now: string;
}) {
  const items: { key: string; to: string; urgent: boolean; text: React.ReactNode }[] = [];
  const soon = addDays(now, evaluationDays);

  for (const c of clients.filter((c) => c.status === "Intake")) {
    items.push({
      key: `intake-${c.id}`,
      to: `/coach/klanten/${c.id}`,
      urgent: true,
      text: (
        <>
          <strong>{c.name}</strong> — intake voorbereiden
        </>
      ),
    });
  }

  for (const o of overview) {
    if (o.client.status !== "Actief") continue;
    const hasNext = appointments.some(
      (a) => a.clientId === o.client.id && !a.sessionId && a.status === "Gepland" && a.date >= now,
    );

    if (o.signal === "op" || o.signal === "verlopen") {
      items.push({
        key: `pack-${o.client.id}`,
        to: `/coach/klanten/${o.client.id}`,
        urgent: true,
        text: (
          <>
            <strong>{o.client.name}</strong> — pakket op
          </>
        ),
      });
    } else if (o.ledger.available > 0 && o.ledger.available <= 2) {
      items.push({
        key: `low-${o.client.id}`,
        to: `/coach/klanten/${o.client.id}`,
        urgent: false,
        text: (
          <>
            <strong>{o.client.name}</strong> — nog {o.ledger.available} credit
            {o.ledger.available === 1 ? "" : "s"}
          </>
        ),
      });
    }

    if (!hasNext) {
      items.push({
        key: `next-${o.client.id}`,
        to: "/coach/agenda",
        urgent: false,
        text: (
          <>
            <strong>{o.client.name}</strong> — geen volgende afspraak
          </>
        ),
      });
    }

    if (o.signal === "inactief") {
      items.push({
        key: `seen-${o.client.id}`,
        to: `/coach/klanten/${o.client.id}`,
        urgent: false,
        text: (
          <>
            <strong>{o.client.name}</strong> — {inactiveDays}+ dagen niet gezien
          </>
        ),
      });
    }

    if (o.client.nextEvaluation && o.client.nextEvaluation <= soon) {
      items.push({
        key: `eval-${o.client.id}`,
        to: "/coach/evaluaties",
        urgent: o.client.nextEvaluation < now,
        text: (
          <>
            <strong>{o.client.name}</strong> — evaluatie {formatDateShort(o.client.nextEvaluation)}
          </>
        ),
      });
    }
  }

  // Birthdays in the coming week — a small thing that matters to clients.
  for (const c of clients) {
    if (!c.birthDate || c.status === "Stopgezet") continue;
    const days = daysUntilBirthday(c.birthDate, now);
    if (days === null || days > 7) continue;
    items.push({
      key: `bday-${c.id}`,
      to: `/coach/klanten/${c.id}`,
      urgent: false,
      text: (
        <>
          <strong>{c.name}</strong> — jarig {days === 0 ? "vandaag" : `over ${days} dagen`}
        </>
      ),
    });
  }

  // Anything left unticked from before today keeps the credits wrong.
  const stale = appointments.filter(
    (a) => !a.sessionId && a.status === "Gepland" && a.date < now,
  );
  if (stale.length > 0) {
    items.push({
      key: "stale",
      to: "/coach/agenda",
      urgent: true,
      text: (
        <>
          <strong>
            {stale.length} afspraak{stale.length === 1 ? "" : "en"} nog niet afgevinkt
          </strong>{" "}
          — zolang dat blijft staan kloppen de credits niet
        </>
      ),
    });
  }

  void sessions;

  if (items.length === 0) {
    return (
      <div className="empty-state">
        <strong>Niets dat je aandacht vraagt</strong>
        <p>Alles loopt volgens plan.</p>
      </div>
    );
  }

  const urgent = items.filter((i) => i.urgent);
  const rest = items.filter((i) => !i.urgent);

  return (
    <>
      {urgent.length > 0 && (
        <div className="stack">
          {urgent.map((i) => (
            <Link key={i.key} to={i.to} className="alert crit action-now" style={linkStyle}>
              {i.text}
            </Link>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <>
          {urgent.length > 0 && <h3 className="action-head">Binnenkort</h3>}
          <div className="stack">
            {rest.map((i) => (
              <Link key={i.key} to={i.to} className="alert action-soon" style={linkStyle}>
                {i.text}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const linkStyle = { textDecoration: "none", color: "inherit", display: "block" } as const;

function CompleteModal({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const [status, setStatus] = useState<SessionStatus>("Uitgevoerd");
  return (
    <Modal title="Sessie afronden" onClose={onClose}>
      <p className="sub">
        {appointment.startTime} · {appointment.sessionType} · {appointment.location}
      </p>
      <Field label="Wat is er gebeurd?">
        <Select<SessionStatus> value={status} onChange={setStatus} options={SESSION_STATUSES} />
      </Field>
      <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
        {isChargeable(status) ? "Dit verbruikt één credit." : "Dit kost geen credit."}
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button
          className="btn-primary"
          onClick={async () => {
            await completeAppointment(appointment, status);
            onClose();
          }}
        >
          Opslaan
        </button>
      </div>
    </Modal>
  );
}

export type { Block };
