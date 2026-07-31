import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { exportBackup, importBackup } from "../domain/backup";

const LINKS = [
  { to: "/verkopen", title: "Verkopen", sub: "Pakketten en losse sessies registreren" },
  { to: "/inform", title: "IN FORM", sub: "Uren loggen en maandelijks factureren" },
  { to: "/prijzen", title: "Prijzen", sub: "Prijstabel en uurtarieven" },
  { to: "/instellingen", title: "Instellingen", sub: "Bedrijfsgegevens, facturatie, grenzen" },
];

export default function More() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");

  async function onImport(file: File) {
    if (!confirm("Dit vervangt alle gegevens op dit toestel. Doorgaan?")) return;
    setBusy("Bezig met importeren…");
    try {
      await importBackup(file);
      setBusy("Import gelukt — de app wordt herladen.");
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      setBusy(`Import mislukt: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <h1>Meer</h1>
      <p className="sub">Beheer en back-up.</p>

      <div className="list">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to}>
            <div>
              <div className="item-title">{l.title}</div>
              <div className="item-sub">{l.sub}</div>
            </div>
            <span className="muted">›</span>
          </Link>
        ))}
      </div>

      <h2>Back-up</h2>
      <p className="sub">
        Alle gegevens staan alleen op dit toestel. Maak regelmatig een back-up — bijvoorbeeld elke maand — en
        bewaar het bestand ergens veilig.
      </p>
      <div className="stack">
        <button className="btn-block" onClick={exportBackup}>
          Exporteer back-up (.json)
        </button>
        <button className="btn-block" onClick={() => fileInput.current?.click()}>
          Importeer back-up
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
        {busy && <p className="sub">{busy}</p>}
      </div>

      <h2>Installeren</h2>
      <p className="sub">
        Op de gsm: open het deelmenu van je browser en kies "Zet op beginscherm". Op de pc: klik het
        installatie-icoon rechts in de adresbalk van Chrome of Edge. Daarna werkt de app offline.
      </p>
    </>
  );
}
