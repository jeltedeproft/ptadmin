import { useEffect, useState } from "react";
import { Empty, Field } from "../components/ui";
import { db } from "../db/db";
import type { Settings } from "../db/schema";
import { useSettings } from "../hooks/useData";
import { hashCode, makeSalt, markUnlocked } from "../domain/lock";

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

      <Field label="WhatsApp-nummer voor klanten">
        <input
          type="tel"
          placeholder="+32 470 12 34 56"
          value={form.whatsappNumber}
          onChange={(e) => set("whatsappNumber", e.target.value)}
        />
      </Field>
      <p className="sub">
        Hierop komen klanten bij je terecht als ze in hun eigen scherm op de WhatsApp-knop tikken.
        Laat leeg om die knop te verbergen.
      </p>

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

      <AccessCode />
    </>
  );
}

function AccessCode() {
  const settings = useSettings();
  const [code, setCode] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState("");

  if (!settings) return null;
  const isSet = !!settings.accessCodeHash;

  async function setNewCode() {
    if (code.length < 4) {
      setBusy("Kies een code van minstens 4 tekens.");
      return;
    }
    if (code !== repeat) {
      setBusy("De twee codes zijn niet gelijk.");
      return;
    }
    const salt = makeSalt();
    await db.settings.update(1, { accessCodeSalt: salt, accessCodeHash: await hashCode(code, salt) });
    markUnlocked();
    setCode("");
    setRepeat("");
    setBusy("Toegangscode ingesteld.");
  }

  async function clearCode() {
    if (!confirm("Toegangscode verwijderen? De app opent dan meteen.")) return;
    await db.settings.update(1, { accessCodeHash: undefined, accessCodeSalt: undefined });
    setBusy("Toegangscode verwijderd.");
  }

  return (
    <>
      <h2>Toegangscode</h2>
      <p className="sub">
        Een code beschermt tegen iemand die je gsm of laptop oppakt en de app opent. Ze versleutelt
        de gegevens niet: wie het toestel heeft en de ontwikkelaarstools opent, kan ze nog steeds
        lezen. Voor dat laatste zijn de schermvergrendeling en schijfversleuteling van het toestel
        zelf de juiste bescherming.
      </p>

      {isSet ? (
        <>
          <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--ok)" }}>
            Er staat een toegangscode ingesteld.
          </div>
          <Field label="Vergrendel opnieuw na (minuten weg uit de app)">
            <input
              type="number"
              min="1"
              value={settings.lockAfterMinutes}
              onChange={(e) => db.settings.update(1, { lockAfterMinutes: Number(e.target.value) })}
            />
          </Field>
          <button className="btn-danger btn-block" onClick={clearCode}>
            Toegangscode verwijderen
          </button>
        </>
      ) : (
        <>
          <Field label="Nieuwe code">
            <input type="password" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Herhaal de code">
            <input type="password" inputMode="numeric" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </Field>
          <button className="btn-block" onClick={setNewCode}>
            Code instellen
          </button>
        </>
      )}
      {busy && <p className="sub" style={{ marginTop: 10 }}>{busy}</p>}
    </>
  );
}
