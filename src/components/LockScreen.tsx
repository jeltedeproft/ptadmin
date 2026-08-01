import { useEffect, useState, type ReactNode } from "react";
import { useSettings } from "../hooks/useData";
import { isUnlocked, markUnlocked, verifyCode } from "../domain/lock";

/**
 * Gates the app behind the access code when one is set. Re-locks when the app
 * has been in the background longer than the configured window.
 */
export default function LockGate({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const required = !!settings?.accessCodeHash && !!settings.accessCodeSalt;
  const window_ = settings?.lockAfterMinutes ?? 60;

  useEffect(() => {
    if (!settings) return;
    setUnlocked(!required || isUnlocked(window_));
  }, [settings, required, window_]);

  // Re-check the timeout whenever the app comes back to the foreground.
  useEffect(() => {
    if (!required) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && !isUnlocked(window_)) setUnlocked(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [required, window_]);

  if (!settings) return null;
  if (unlocked) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!settings?.accessCodeHash || !settings.accessCodeSalt) return;
    setChecking(true);
    const ok = await verifyCode(code, settings.accessCodeSalt, settings.accessCodeHash);
    setChecking(false);
    if (ok) {
      markUnlocked();
      setUnlocked(true);
      setCode("");
      setError("");
    } else {
      setError("Verkeerde code.");
      setCode("");
    }
  }

  return (
    <div className="lock">
      <form className="lock-box" onSubmit={submit}>
        <h1>PT Admin</h1>
        <p className="sub">Voer je toegangscode in.</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError("");
          }}
          style={{ textAlign: "center", letterSpacing: "0.3em", fontSize: 22 }}
        />
        {error && (
          <p className="sub" style={{ color: "var(--crit)", marginTop: 10 }}>
            {error}
          </p>
        )}
        <button className="btn-primary btn-block" style={{ marginTop: 14 }} disabled={!code || checking}>
          {checking ? "Controleren…" : "Ontgrendelen"}
        </button>
      </form>
    </div>
  );
}
