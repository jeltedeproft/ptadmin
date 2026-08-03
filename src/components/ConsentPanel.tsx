import { Badge } from "./ui";
import { db } from "../db/db";
import type { Client, Settings } from "../db/schema";
import { formatDate, today } from "../domain/dates";
import { useSettings } from "../hooks/useData";

/**
 * Recording consent, on the client's page.
 *
 * Health details are a special category under GDPR: consent has to be explicit
 * and demonstrable afterwards. So this stores a date and the version of the
 * text agreed to, and shows the wording itself — asking someone to agree to
 * something they cannot read is not consent.
 */

type Kind = "health" | "photos";

const KINDS: { kind: Kind; title: string; why: string }[] = [
  {
    kind: "health",
    title: "Gezondheidsgegevens",
    why: "Nodig om blessures, medicatie en klachten bij te houden en de training daarop aan te passen.",
  },
  {
    kind: "photos",
    title: "Voortgangsfoto's",
    why: "Nodig om foto's bij evaluaties te bewaren.",
  },
];

function stateOf(client: Client, kind: Kind) {
  return kind === "health"
    ? { on: client.consentHealthOn, version: client.consentHealthVersion }
    : { on: client.consentPhotosOn, version: client.consentPhotosVersion };
}

function textOf(settings: Settings, kind: Kind): string {
  return kind === "health" ? settings.consentHealthText : settings.consentPhotosText;
}

export default function ConsentPanel({ client }: { client: Client }) {
  const settings = useSettings();
  if (!settings) return null;

  async function give(kind: Kind) {
    const stamp = { on: today(), version: settings!.consentVersion };
    await db.clients.update(
      client.id!,
      kind === "health"
        ? { consentHealthOn: stamp.on, consentHealthVersion: stamp.version }
        : { consentPhotosOn: stamp.on, consentPhotosVersion: stamp.version },
    );
  }

  async function withdraw(kind: Kind, title: string) {
    if (!confirm(`Toestemming voor ${title.toLowerCase()} intrekken?`)) return;
    await db.clients.update(
      client.id!,
      kind === "health"
        ? { consentHealthOn: undefined, consentHealthVersion: undefined }
        : { consentPhotosOn: undefined, consentPhotosVersion: undefined },
    );
  }

  return (
    <>
      <h2>Toestemmingen</h2>
      <p className="sub">
        Vraag dit bij de intake en vink het hier af. Zonder toestemming horen er geen
        gezondheidsgegevens in de fiche te staan.
      </p>

      <div className="stack">
        {KINDS.map(({ kind, title, why }) => {
          const { on, version } = stateOf(client, kind);
          const outdated = !!on && version !== settings.consentVersion;

          return (
            <div className="card" key={kind}>
              <div className="row-between">
                <strong>{title}</strong>
                <Badge tone={on ? (outdated ? "waarschuwing" : "ok") : ""}>
                  {on ? (outdated ? "Verouderde tekst" : "Gegeven") : "Niet gegeven"}
                </Badge>
              </div>
              <div className="item-sub">{why}</div>

              {on ? (
                <>
                  <div className="item-sub">
                    Gegeven op {formatDate(on)} · tekstversie {version ?? "onbekend"}
                    {outdated && ` · huidige versie is ${settings.consentVersion}`}
                  </div>
                  <div className="row" style={{ marginTop: 12 }}>
                    {outdated && (
                      <button className="btn-sm btn-primary" onClick={() => give(kind)}>
                        Opnieuw bevestigen
                      </button>
                    )}
                    <button className="btn-sm btn-danger" onClick={() => withdraw(kind, title)}>
                      Intrekken
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <blockquote className="consent-text">{textOf(settings, kind)}</blockquote>
                  <button className="btn-sm btn-primary" onClick={() => give(kind)}>
                    {client.name.split(" ")[0]} gaat akkoord
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {!client.consentHealthOn && (
        <div className="alert crit" style={{ marginTop: 12 }}>
          Nog geen toestemming voor gezondheidsgegevens. Noteer voorlopig geen blessures,
          medicatie of klachten bij deze klant.
        </div>
      )}
    </>
  );
}
