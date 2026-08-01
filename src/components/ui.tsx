import { useEffect, type CSSProperties, type ReactNode } from "react";

export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

/**
 * Stat tile. `size` sets the visual rank — the dashboard reads top-down, so
 * weight has to fall off as importance does.
 */
export function Kpi({
  label,
  value,
  size = "md",
  sub,
}: {
  label: string;
  value: ReactNode;
  size?: "lg" | "md" | "sm";
  sub?: ReactNode;
}) {
  return (
    <div className={`card kpi kpi-${size}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

/**
 * The one number the dashboard leads with. Exactly one per view — a second
 * hero is just two competing headlines.
 */
export function Hero({
  label,
  value,
  delta,
  context,
}: {
  label: string;
  value: string;
  delta?: { text: string; good: boolean | null };
  context?: ReactNode;
}) {
  return (
    <div className="card hero">
      <div className="label">{label}</div>
      <div className="hero-value">{value}</div>
      <div className="hero-foot">
        {delta && (
          <span className={`delta${delta.good === null ? "" : delta.good ? " up" : " down"}`}>
            {delta.text}
          </span>
        )}
        {context && <span className="muted">{context}</span>}
      </div>
    </div>
  );
}

export function Badge({ tone = "", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Meter({ ratio, level }: { ratio: number; level: string }) {
  return (
    <div className={`meter ${level}`}>
      <i style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: readonly T[];
  placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
