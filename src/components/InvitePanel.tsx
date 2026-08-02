import { useEffect, useState } from "react";
import { db } from "../db/db";
import { supabase, hasBackend, appUrl } from "../db/supabase";
import { useAuth } from "../auth/AuthProvider";
import type { Client } from "../db/schema";

type Status = "loading" | "no-email" | "not-synced" | "invited" | "linked" | "error";

/**
 * Client access, from the coach's side.
 *
 * There is no separate invite record: the link is made by matching the
 * confirmed e-mail address on the client's first sign-in. So all the coach has
 * to do is make sure the address on the fiche is the one they will register
 * with, and send them the link.
 */
export default function InvitePanel({ client }: { client: Client }) {
  const { role } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!client.email?.trim()) return alive && setStatus("no-email");

      const map = await db.idmap.get({ table: "clients", localId: client.id! });
      if (!map) return alive && setStatus("not-synced");

      const { data, error } = await supabase!
        .from("clients")
        .select("auth_user_id")
        .eq("id", map.remoteId)
        .maybeSingle();

      if (!alive) return;
      if (error) return setStatus("error");
      setStatus(data?.auth_user_id ? "linked" : "invited");
    })();
    return () => {
      alive = false;
    };
  }, [client.id, client.email]);

  if (!hasBackend || role !== "coach") return null;

  const message =
    `Hoi ${client.name.split(" ")[0]},\n\n` +
    `Je kan je trainingen, credits en pakketten voortaan zelf bekijken:\n${appUrl()}\n\n` +
    `Maak een account aan met dit e-mailadres: ${client.email}\n` +
    `Gebruik zeker datzelfde adres, anders vindt de app je gegevens niet.`;

  async function copy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <h2>Toegang voor de klant</h2>

      {status === "loading" && <p className="sub">Even kijken…</p>}

      {status === "no-email" && (
        <div className="alert">
          Vul eerst een e-mailadres in bij deze klant. De koppeling gebeurt op dat adres.
        </div>
      )}

      {status === "not-synced" && (
        <div className="alert">
          Deze klant staat nog niet op de server. Synchroniseer eerst via Meer.
        </div>
      )}

      {status === "error" && (
        <div className="alert crit">Kon de status niet ophalen. Ben je online?</div>
      )}

      {status === "linked" && (
        <div className="alert" style={{ borderLeftColor: "var(--ok)" }}>
          <strong>{client.name} heeft toegang.</strong> Ze zien hun eigen credits, sessies en
          pakketten — verder niets.
        </div>
      )}

      {status === "invited" && (
        <>
          <p className="sub">
            Nog geen account. Stuur deze boodschap door; zodra ze zich aanmelden met{" "}
            <strong>{client.email}</strong> worden hun gegevens automatisch gekoppeld.
          </p>
          <pre className="invite">{message}</pre>
          <div className="row">
            <button className="btn-primary" onClick={copy}>
              {copied ? "Gekopieerd ✓" : "Kopieer bericht"}
            </button>
            <a
              className="btn"
              href={`mailto:${client.email}?subject=${encodeURIComponent("Je trainingsoverzicht")}&body=${encodeURIComponent(message)}`}
            >
              Mail openen
            </a>
          </div>
        </>
      )}
    </>
  );
}
