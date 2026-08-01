import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { Badge, Empty, Field, Modal, Select } from "../components/ui";
import { db } from "../db/db";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LOCATIONS,
  PRICED_SESSION_TYPES,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type Location,
  type PricedSessionType,
} from "../db/schema";
import { formatDateShort, today } from "../domain/dates";

/** Statuses that mean the lead is no longer being worked. */
const CLOSED: LeadStatus[] = ["Klant geworden", "Geen interesse"];

function tone(lead: Lead, now: string): string {
  if (lead.status === "Klant geworden") return "ok";
  if (lead.status === "Geen interesse") return "";
  if (lead.followUpOn && lead.followUpOn <= now) return "kritiek";
  return "waarschuwing";
}

export default function Leads() {
  const leads = useLiveQuery(() => db.leads.orderBy("name").toArray(), []);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Lead | null>(null);

  if (!leads) return <Empty>Laden…</Empty>;

  const now = today();
  const active = leads.filter((l) => !CLOSED.includes(l.status));
  const closed = leads.filter((l) => CLOSED.includes(l.status));
  const due = active.filter((l) => l.followUpOn && l.followUpOn <= now);

  return (
    <>
      <div className="row-between">
        <h1>Leads</h1>
        <button className="btn-primary" onClick={() => setAdding(true)}>
          + Lead
        </button>
      </div>
      <p className="sub">
        {active.length} in opvolging · {closed.length} afgesloten
      </p>

      {due.length > 0 && (
        <div className="alert crit" style={{ marginBottom: 14 }}>
          {due.length} lead{due.length === 1 ? "" : "s"} met een opvolgdatum die bereikt is.
        </div>
      )}

      {leads.length === 0 ? (
        <Empty>Nog geen leads. Voeg iemand toe zodra je een eerste contact hebt.</Empty>
      ) : (
        <>
          {active.length > 0 && (
            <div className="list">
              {active.map((l) => (
                <button key={l.id} onClick={() => setOpen(l)}>
                  <div>
                    <div className="item-title">{l.name}</div>
                    <div className="item-sub">
                      {l.status}
                      {l.source ? ` · via ${l.source}` : ""}
                      {l.followUpOn ? ` · opvolgen ${formatDateShort(l.followUpOn)}` : ""}
                    </div>
                  </div>
                  <Badge tone={tone(l, now)}>
                    {l.followUpOn && l.followUpOn <= now ? "Opvolgen" : l.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {closed.length > 0 && (
            <>
              <h2>Afgesloten</h2>
              <div className="list">
                {closed.map((l) => (
                  <button key={l.id} onClick={() => setOpen(l)}>
                    <div>
                      <div className="item-title">{l.name}</div>
                      <div className="item-sub">
                        {l.status} · eerste contact {formatDateShort(l.firstContact)}
                      </div>
                    </div>
                    <Badge tone={tone(l, now)}>{l.status}</Badge>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {adding && <LeadModal onClose={() => setAdding(false)} />}
      {open && <LeadModal lead={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LeadModal({ lead, onClose }: { lead?: Lead; onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Lead>(
    lead ?? { name: "", status: "Nieuw", firstContact: today() },
  );
  const set = <K extends keyof Lead>(k: K, v: Lead[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return;
    const record = { ...form, name: form.name.trim() };
    if (lead?.id) await db.leads.update(lead.id, record);
    else await db.leads.add(record);
    onClose();
  }

  /** Carries the lead's details across into a client record, keeping the lead as history. */
  async function convert() {
    if (!lead?.id) return;
    const clientId = await db.clients.add({
      name: form.name.trim(),
      status: "Actief",
      startDate: today(),
      location: form.wantedLocation ?? "Privéruimte",
      email: form.email,
      phone: form.phone,
      note: [form.interest, form.note].filter(Boolean).join(" — ") || undefined,
    });
    await db.leads.update(lead.id, {
      ...form,
      status: "Klant geworden",
      convertedClientId: clientId,
      followUpOn: undefined,
    });
    onClose();
    navigate(`/coach/klanten/${clientId}`);
  }

  async function remove() {
    if (!lead?.id || !confirm(`${lead.name} verwijderen?`)) return;
    await db.leads.delete(lead.id);
    onClose();
  }

  const converted = !!form.convertedClientId;

  return (
    <Modal title={lead ? form.name || "Lead" : "Nieuwe lead"} onClose={onClose}>
      <Field label="Naam">
        <input autoFocus={!lead} value={form.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="fields-2">
        <Field label="Telefoon">
          <input type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
      </div>
      <div className="fields-2">
        <Field label="Bron">
          <Select<LeadSource>
            value={form.source ?? ""}
            onChange={(v) => set("source", v)}
            options={LEAD_SOURCES}
            placeholder="Onbekend"
          />
        </Field>
        <Field label="Eerste contact">
          <input
            type="date"
            value={form.firstContact}
            onChange={(e) => set("firstContact", e.target.value)}
          />
        </Field>
      </div>
      <div className="fields-2">
        <Field label="Gewenste locatie">
          <Select<Location>
            value={form.wantedLocation ?? ""}
            onChange={(v) => set("wantedLocation", v)}
            options={LOCATIONS}
            placeholder="Nog niet geweten"
          />
        </Field>
        <Field label="Gewenst type">
          <Select<PricedSessionType>
            value={form.wantedSessionType ?? ""}
            onChange={(v) => set("wantedSessionType", v)}
            options={PRICED_SESSION_TYPES}
            placeholder="Nog niet geweten"
          />
        </Field>
      </div>
      <Field label="Interesse">
        <input
          placeholder="Waar is deze persoon naar op zoek?"
          value={form.interest ?? ""}
          onChange={(e) => set("interest", e.target.value)}
        />
      </Field>
      <div className="fields-2">
        <Field label="Status">
          <Select<LeadStatus> value={form.status} onChange={(v) => set("status", v)} options={LEAD_STATUSES} />
        </Field>
        <Field label="Volgende opvolging">
          <input
            type="date"
            value={form.followUpOn ?? ""}
            onChange={(e) => set("followUpOn", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Notitie">
        <textarea value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
      </Field>

      {converted && (
        <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--ok)" }}>
          Al omgezet naar een klant. De leadhistoriek blijft hier bewaard.
        </div>
      )}

      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={!form.name.trim()}>
          Opslaan
        </button>
      </div>
      {lead && !converted && (
        <button className="btn-block" style={{ marginTop: 10 }} onClick={convert}>
          Omzetten naar klant
        </button>
      )}
      {lead && (
        <button className="btn-block btn-danger" style={{ marginTop: 10 }} onClick={remove}>
          Verwijderen
        </button>
      )}
    </Modal>
  );
}
