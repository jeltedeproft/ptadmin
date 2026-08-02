import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Badge, Empty, Field, Modal } from "../components/ui";
import { db } from "../db/db";
import { MEASURES, type Client, type MeasureKey } from "../db/schema";
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
  const previous = useLiveQuery(
    () => db.evaluations.where("clientId").equals(client.id!).reverse().sortBy("date"),
    [client.id],
  );
  const [done, setDone] = useState(today());
  const [next, setNext] = useState(client.nextEvaluation ?? addDays(today(), 90));
  const [goal, setGoal] = useState("");
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Partial<Record<MeasureKey, string>>>({});

  const last = previous?.[0];

  function set(key: MeasureKey, v: string) {
    setValues((s) => ({ ...s, [key]: v }));
  }

  async function save() {
    const measures = Object.fromEntries(
      MEASURES.map((m) => [m.key, values[m.key] ? Number(values[m.key]) : undefined]).filter(
        ([, v]) => v !== undefined,
      ),
    );
    await db.transaction("rw", [db.evaluations, db.clients], async () => {
      await db.evaluations.add({
        clientId: client.id!,
        date: done,
        goal: goal.trim() || undefined,
        note: note.trim() || undefined,
        ...measures,
      });
      await db.clients.update(client.id!, { lastEvaluation: done, nextEvaluation: next });
    });
    onClose();
  }

  return (
    <Modal title={`Evaluatie — ${client.name}`} onClose={onClose}>
      <div className="fields-2">
        <Field label="Uitgevoerd op">
          <input type="date" value={done} onChange={(e) => setDone(e.target.value)} />
        </Field>
        <Field label="Volgende evaluatie">
          <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>

      <label>Metingen</label>
      <p className="sub" style={{ marginBottom: 8 }}>
        Laat leeg wat je niet gemeten hebt.
        {last && ` Tussen haakjes staat de vorige meting van ${formatDateShort(last.date)}.`}
      </p>
      <div className="fields-2">
        {MEASURES.map((m) => (
          <Field key={m.key} label={`${m.label} (${m.unit})`}>
            <input
              type="number"
              step="0.1"
              min="0"
              placeholder={last?.[m.key] !== undefined ? String(last[m.key]) : ""}
              value={values[m.key] ?? ""}
              onChange={(e) => set(m.key, e.target.value)}
            />
          </Field>
        ))}
      </div>

      <Field label="Doel voor de komende periode">
        <input value={goal} onChange={(e) => setGoal(e.target.value)} />
      </Field>
      <Field label="Notitie">
        <textarea
          placeholder="Wat viel op, wat is de volgende stap?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
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

/** Evaluation history for one client, with the change since the previous one. */
export function EvaluationHistory({ clientId }: { clientId: number }) {
  const evaluations = useLiveQuery(
    () => db.evaluations.where("clientId").equals(clientId).reverse().sortBy("date"),
    [clientId],
  );
  if (!evaluations || evaluations.length === 0) return null;

  return (
    <>
      <h2>Evaluaties</h2>
      <div className="list">
        {evaluations.map((e, i) => {
          const before = evaluations[i + 1];
          return (
            <div key={e.id}>
              <div>
                <div className="item-title">{formatDateShort(e.date)}</div>
                {e.goal && <div className="item-sub">Doel: {e.goal}</div>}
                <div className="item-sub">
                  {MEASURES.filter((m) => e[m.key] !== undefined)
                    .map((m) => {
                      const now = e[m.key] as number;
                      const then = before?.[m.key] as number | undefined;
                      const delta = then === undefined ? "" : ` (${now - then > 0 ? "+" : ""}${round(now - then)})`;
                      return `${m.label} ${now}${m.unit}${delta}`;
                    })
                    .join(" · ") || "geen metingen"}
                </div>
                {e.note && <div className="item-sub">{e.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;
