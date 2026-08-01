import { Link } from "react-router-dom";
import { Badge, Empty } from "../components/ui";
import { SIGNAL_LABEL } from "../domain/credits";
import { formatDateShort } from "../domain/dates";
import { useOverview } from "../hooks/useData";

/**
 * Het Klantenoverzicht uit de specificatie: één regel per klant, volledig
 * berekend. Geen invoer hier — alles komt uit verkopen en sessies.
 */
export default function Credits() {
  const overview = useOverview();
  if (!overview) return <Empty>Laden…</Empty>;

  const active = overview.filter((o) => o.client.status === "Actief");
  const rest = overview.filter((o) => o.client.status !== "Actief");

  const totalCredits = active.reduce((s, o) => s + o.ledger.available, 0);
  const owed = active.reduce((s, o) => s + o.ledger.looseUnused, 0);

  return (
    <>
      <h1>Credits</h1>
      <p className="sub">
        {totalCredits} credits uitstaand bij {active.length} actieve klanten
        {owed > 0 && ` · ${owed} losse sessie${owed === 1 ? "" : "s"} nog te geven`}
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <Link className="btn btn-primary" to="/business/verkopen">
          Verkopen
        </Link>
        <Link className="btn" to="/business/sessies">
          Sessies
        </Link>
      </div>

      {overview.length === 0 ? (
        <Empty>Nog geen klanten.</Empty>
      ) : (
        <>
          <Row rows={active} />
          {rest.length > 0 && (
            <>
              <h2>Niet actief</h2>
              <Row rows={rest} />
            </>
          )}
        </>
      )}
    </>
  );
}

function Row({ rows }: { rows: ReturnType<typeof useOverview> }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="list">
      {rows.map((o) => (
        <Link key={o.client.id} to={`/coach/klanten/${o.client.id}`}>
          <div>
            <div className="item-title">{o.client.name}</div>
            <div className="item-sub">
              {o.ledger.available} credits
              {o.ledger.looseUnused > 0 && ` · ${o.ledger.looseUnused} losse tegoed`}
              {o.ledger.nextExpiry && ` · vervalt ${formatDateShort(o.ledger.nextExpiry)}`}
            </div>
            <div className="item-sub">
              {o.sessionCount} sessies · laatste {formatDateShort(o.lastSession)}
              {o.ledger.forfeited > 0 && ` · ${o.ledger.forfeited} vervallen`}
            </div>
          </div>
          <Badge tone={o.signal === "ok" ? "ok" : o.signal}>{SIGNAL_LABEL[o.signal]}</Badge>
        </Link>
      ))}
    </div>
  );
}
