import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Empty } from "../components/ui";
import { isChargeable } from "../domain/credits";
import { addDays, formatDate, formatDateShort, startOfWeek, today, toIso } from "../domain/dates";
import { useClients, useSessions } from "../hooks/useData";

const DAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

/**
 * Weekoverzicht van wat er gebeurd is.
 *
 * Vooruit plannen en synchroniseren met Google Agenda hangt aan de gehoste
 * versie: daarvoor moeten afspraken buiten dit toestel bestaan. Tot dan toont
 * dit scherm de week zoals ze gelogd is.
 */
export default function Planning() {
  const sessions = useSessions();
  const clients = useClients();
  const [weekStart, setWeekStart] = useState(startOfWeek());

  if (!sessions || !clients) return <Empty>Laden…</Empty>;
  const nameOf = (id: number) => clients.find((c) => c.id === id)?.name ?? "Onbekend";

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];
  const inWeek = sessions.filter((s) => s.date >= weekStart && s.date <= weekEnd);
  const charged = inWeek.filter((s) => isChargeable(s.status)).length;
  const now = today();

  return (
    <>
      <h1>Planning</h1>

      <div className="monthnav">
        <button aria-label="Vorige week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ‹
        </button>
        <div className="monthnav-label">
          <strong>
            {formatDateShort(weekStart)} – {formatDateShort(weekEnd)}
          </strong>
          {weekStart !== startOfWeek() && (
            <button className="btn-sm" onClick={() => setWeekStart(startOfWeek())}>
              Deze week
            </button>
          )}
        </div>
        <button aria-label="Volgende week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          ›
        </button>
      </div>

      <p className="sub">
        {inWeek.length} sessies gelogd, waarvan {charged} aangerekend
      </p>

      {days.map((date, i) => {
        const onDay = inWeek.filter((s) => s.date === date);
        return (
          <div key={date}>
            <h3 className={date === now ? "day-today" : undefined}>
              {DAYS[i]} {formatDateShort(date)}
              {date === now && " · vandaag"}
            </h3>
            {onDay.length === 0 ? (
              <p className="sub" style={{ margin: "0 0 8px" }}>
                —
              </p>
            ) : (
              <div className="list" style={{ marginBottom: 10 }}>
                {onDay.map((s) => (
                  <Link key={s.id} to={`/coach/klanten/${s.clientId}`}>
                    <div>
                      <div className="item-title">{nameOf(s.clientId)}</div>
                      <div className="item-sub">
                        {s.sessionType} · {s.location}
                        {s.groupId ? ` · groep ${s.groupId}` : ""}
                      </div>
                    </div>
                    <Badge tone={isChargeable(s.status) ? "" : "ok"}>{s.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="alert" style={{ marginTop: 18, borderLeftColor: "var(--accent)" }}>
        <strong>Vooruit plannen komt met de gehoste versie.</strong> Afspraken die vooruit staan
        moeten buiten dit toestel bestaan om met Google Agenda te kunnen synchroniseren. Zie
        supabase/SETUP.md.
      </div>
    </>
  );
}

export { toIso, formatDate };
