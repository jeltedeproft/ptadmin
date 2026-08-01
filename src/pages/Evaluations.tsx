import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Empty, Field, Modal } from "../components/ui";
import { db } from "../db/db";
import type { Client } from "../db/schema";
import { addDays, daysBetween, formatDateShort, today } from "../domain/dates";
import { useClients, useSettings } from "../hooks/useData";

export default function Evaluations() {
  const clients = useClients();
  const settings = useSettings();
  const [planning, setPlanning] = useState<Client | null>(null);

  if (!clients || !settings) return <Empty>Laden…</Empty>;

  const now = today();
  const soon = addDays(now, settings.evaluationLookaheadDays);
  const active = clients.filter((c) => c.status === "Actief");

  const overdue = active.filter((c) => c.nextEvaluation && c.nextEvaluation < now);
  const upcoming = active.filter(
    (c) => c.nextEvaluation && c.nextEvaluation >= now && c.nextEvaluation <= soon,
  );
  const later = active.filter((c) => c.nextEvaluation && c.nextEvaluation > soon);
  const unplanned = active.filter((c) => !c.nextEvaluation);

  return (
    <>
      <h1>Evaluaties</h1>
      <p className="sub">
        {overdue.length} te laat · {upcoming.length} binnen {settings.evaluationLookaheadDays} dagen ·{" "}
        {unplanned.length} nog niet gepland
      </p>

      <Group title="Te laat" clients={overdue} tone="kritiek" now={now} onPlan={setPlanning} />
      <Group title="Binnenkort" clients={upcoming} tone="waarschuwing" now={now} onPlan={setPlanning} />
      <Group title="Nog niet gepland" clients={unplanned} tone="" now={now} onPlan={setPlanning} />
      <Group title="Later" clients={later} tone="ok" now={now} onPlan={setPlanning} />

      {active.length === 0 && <Empty>Nog geen actieve klanten.</Empty>}

      {planning && <PlanModal client={planning} onClose={() => setPlanning(null)} />}
    </>
  );
}

function Group({
  title,
  clients,
  tone,
  now,
  onPlan,
}: {
  title: string;
  clients: Client[];
  tone: string;
  now: string;
  onPlan: (c: Client) => void;
}) {
  if (clients.length === 0) return null;
  return (
    <>
      <h2>{title}</h2>
      <div className="list">
        {clients.map((c) => (
          <div key={c.id}>
            <div>
              <Link to={`/coach/klanten/${c.id}`} className="item-title">
                {c.name}
              </Link>
              <div className="item-sub">
                {c.lastEvaluation
                  ? `laatste evaluatie ${formatDateShort(c.lastEvaluation)}`
                  : "nog nooit geëvalueerd"}
                {c.nextEvaluation &&
                  ` · volgende ${formatDateShort(c.nextEvaluation)} (${describe(daysBetween(now, c.nextEvaluation))})`}
              </div>
            </div>
            <div className="row">
              {tone && <Badge tone={tone}>{title}</Badge>}
              <button className="btn-sm btn-primary" onClick={() => onPlan(c)}>
                Plannen
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function describe(days: number): string {
  if (days === 0) return "vandaag";
  if (days < 0) return `${Math.abs(days)} dagen geleden`;
  return `over ${days} dagen`;
}

function PlanModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const [done, setDone] = useState(client.lastEvaluation ?? today());
  const [next, setNext] = useState(client.nextEvaluation ?? addDays(today(), 90));
  const [note, setNote] = useState("");

  async function save() {
    const stamp = note.trim()
      ? `${formatDateShort(done)} — evaluatie: ${note.trim()}`
      : undefined;
    await db.clients.update(client.id!, {
      lastEvaluation: done,
      nextEvaluation: next,
      note: stamp ? [client.note, stamp].filter(Boolean).join("\n") : client.note,
    });
    onClose();
  }

  return (
    <Modal title={`Evaluatie — ${client.name}`} onClose={onClose}>
      <Field label="Evaluatie uitgevoerd op">
        <input type="date" value={done} onChange={(e) => setDone(e.target.value)} />
      </Field>
      <Field label="Volgende evaluatie">
        <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Notitie bij deze evaluatie">
        <textarea
          placeholder="Wat viel op, wat is de volgende stap?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <p className="sub">
        De notitie wordt bij de klant bewaard. Metingen en voortgangscijfers komen later.
      </p>
      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save}>
          Opslaan
        </button>
      </div>
    </Modal>
  );
}
