import { useEffect, useState } from "react";
import { Empty, Field } from "../components/ui";
import { db } from "../db/db";
import type { Settings } from "../db/schema";
import { useSettings } from "../hooks/useData";

export default function SettingsPage() {
  const stored = useSettings();
  const [form, setForm] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (stored && !form) setForm(stored);
  }, [stored, form]);

  if (!form) return <Empty>Laden…</Empty>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const num = <K extends keyof Settings>(k: K) => (e: { target: { value: string } }) =>
    set(k, Number(e.target.value) as Settings[K]);

  async function save() {
    await db.settings.put(form!);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <h1>Instellingen</h1>
      <p className="sub">Deze gegevens verschijnen op je facturen.</p>

      <h2>Onderneming</h2>
      <Field label="Bedrijfsnaam">
        <input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
      </Field>
      <Field label="Handelsnaam">
        <input value={form.tradeName} onChange={(e) => set("tradeName", e.target.value)} />
      </Field>
      <Field label="Adres">
        <input value={form.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="fields-2">
        <Field label="Ondernemingsnummer">
          <input value={form.companyNumber} onChange={(e) => set("companyNumber", e.target.value)} />
        </Field>
        <Field label="BTW-nummer (op factuur)">
          <input
            placeholder="BE0123.456.789"
            value={form.vatNumber}
            onChange={(e) => set("vatNumber", e.target.value)}
          />
        </Field>
      </div>
      <Field label="IBAN">
        <input value={form.iban} onChange={(e) => set("iban", e.target.value)} />
      </Field>
      <div className="fields-2">
        <Field label="E-mail">
          <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Telefoon">
          <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>

      <Field label="Logo op de factuur">
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => set("logoDataUrl", String(reader.result));
            reader.readAsDataURL(file);
          }}
        />
      </Field>
      {form.logoDataUrl ? (
        <div className="row" style={{ marginBottom: 12 }}>
          <img
            src={form.logoDataUrl}
            alt="Logo"
            style={{ maxHeight: 46, maxWidth: 160, background: "#fff", padding: 6, borderRadius: 8 }}
          />
          <button className="btn-sm btn-danger" onClick={() => set("logoDataUrl", undefined)}>
            Verwijder
          </button>
        </div>
      ) : (
        <p className="sub">Zonder logo staat je handelsnaam als woordmerk bovenaan de factuur.</p>
      )}

      <h2>Facturatie</h2>
      <div className="fields-2">
        <Field label="Betaaltermijn (dagen)">
          <input type="number" value={form.paymentTermDays} onChange={num("paymentTermDays")} />
        </Field>
        <Field label="Volgend factuurnummer">
          <input value={form.nextInvoiceNumber} onChange={(e) => set("nextInvoiceNumber", e.target.value)} />
        </Field>
      </div>
      <Field label="BTW-vermelding">
        <textarea value={form.vatNote} onChange={(e) => set("vatNote", e.target.value)} />
      </Field>

      <h2>IN FORM</h2>
      <Field label="Officiële naam">
        <input value={form.informName} onChange={(e) => set("informName", e.target.value)} />
      </Field>
      <Field label="Adres">
        <input value={form.informAddress} onChange={(e) => set("informAddress", e.target.value)} />
      </Field>
      <div className="fields-2">
        <Field label="Ondernemingsnummer">
          <input value={form.informCompanyNumber} onChange={(e) => set("informCompanyNumber", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <input value={form.informEmail} onChange={(e) => set("informEmail", e.target.value)} />
        </Field>
      </div>

      <h2>Grensbewaking</h2>
      <div className="fields-2">
        <Field label="BTW-grens (€)">
          <input type="number" value={form.vatThreshold} onChange={num("vatThreshold")} />
        </Field>
        <Field label="Veiligheidsmarge (€)">
          <input type="number" value={form.vatSafetyMargin} onChange={num("vatSafetyMargin")} />
        </Field>
      </div>
      <div className="fields-2">
        <Field label="Waarschuwing vanaf (0–1)">
          <input type="number" step="0.05" value={form.warnRatio} onChange={num("warnRatio")} />
        </Field>
        <Field label="Kritiek vanaf (0–1)">
          <input type="number" step="0.05" value={form.criticalRatio} onChange={num("criticalRatio")} />
        </Field>
      </div>
      <div className="fields-2">
        <Field label="Sociale vrijstellingsgrens (€)">
          <input type="number" step="0.01" value={form.socialExemptionThreshold} onChange={num("socialExemptionThreshold")} />
        </Field>
        <Field label="Hoofdberoepgrens (€)">
          <input type="number" step="0.01" value={form.socialMainOccupationThreshold} onChange={num("socialMainOccupationThreshold")} />
        </Field>
      </div>
      <Field label="Geschatte beroepskosten dit jaar (€)">
        <input type="number" value={form.estimatedBusinessCosts} onChange={num("estimatedBusinessCosts")} />
      </Field>

      <h2>Signalen</h2>
      <div className="fields-2">
        <Field label="Waarschuw x dagen voor pakket vervalt">
          <input type="number" value={form.packExpiryWarningDays} onChange={num("packExpiryWarningDays")} />
        </Field>
        <Field label="Toon evaluaties x dagen vooruit">
          <input type="number" value={form.evaluationLookaheadDays} onChange={num("evaluationLookaheadDays")} />
        </Field>
      </div>
      <Field label="Signaleer na x dagen zonder training">
        <input type="number" value={form.inactiveDays} onChange={num("inactiveDays")} />
      </Field>

      <button className="btn-primary btn-block" style={{ marginTop: 18 }} onClick={save}>
        {saved ? "Opgeslagen ✓" : "Opslaan"}
      </button>
    </>
  );
}
