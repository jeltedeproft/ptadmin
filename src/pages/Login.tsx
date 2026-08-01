import { useState } from "react";
import { Field } from "../components/ui";
import { requireSupabase } from "../db/supabase";

type Mode = "in" | "up" | "reset";

/** Supabase returns English; these are the ones people actually hit. */
function dutch(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mailadres of wachtwoord klopt niet.";
  if (m.includes("email not confirmed")) return "Bevestig eerst de link in je mailbox.";
  if (m.includes("user already registered")) return "Er bestaat al een account met dit adres.";
  if (m.includes("password should be")) return "Kies een wachtwoord van minstens zes tekens.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Te veel pogingen. Probeer het over enkele minuten opnieuw.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Geen verbinding. Controleer je internet.";
  return message;
}

export default function Login() {
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const sb = requireSupabase();

    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        setNotice("Account aangemaakt. Bevestig de link in je mailbox en meld je daarna aan.");
        setMode("in");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname,
        });
        if (error) throw error;
        setNotice("We stuurden een herstelmail. Kijk in je mailbox.");
        setMode("in");
      }
    } catch (err) {
      setError(dutch((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    in: "Aanmelden",
    up: "Account aanmaken",
    reset: "Wachtwoord vergeten",
  };

  return (
    <div className="lock">
      <form className="lock-box" onSubmit={submit}>
        <h1>PT Admin</h1>
        <p className="sub">{titles[mode]}</p>

        <Field label="E-mailadres">
          <input
            autoFocus
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        {mode !== "reset" && (
          <Field label="Wachtwoord">
            <input
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}

        {error && <p className="sub" style={{ color: "var(--crit)" }}>{error}</p>}
        {notice && <p className="sub" style={{ color: "var(--ok)" }}>{notice}</p>}

        <button className="btn-primary btn-block" disabled={busy}>
          {busy ? "Bezig…" : titles[mode]}
        </button>

        <div className="row" style={{ marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>
          {mode !== "in" && (
            <button type="button" className="btn-sm" onClick={() => setMode("in")}>
              Aanmelden
            </button>
          )}
          {mode !== "up" && (
            <button type="button" className="btn-sm" onClick={() => setMode("up")}>
              Account aanmaken
            </button>
          )}
          {mode !== "reset" && (
            <button type="button" className="btn-sm" onClick={() => setMode("reset")}>
              Wachtwoord vergeten
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
