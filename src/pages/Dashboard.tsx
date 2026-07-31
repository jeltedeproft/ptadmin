import { Link } from "react-router-dom";
import { Badge, Card, Empty, Kpi, Meter } from "../components/ui";
import { useInform, useInvoices, useOverview, useSessions, useSettings, useTransactions } from "../hooks/useData";
import { isChargeable, SIGNAL_LABEL } from "../domain/credits";
import {
  addDays,
  daysBetween,
  formatDateShort,
  formatEuro,
  startOfMonth,
  startOfWeek,
  startOfYear,
  today,
} from "../domain/dates";
import { LEVEL_LABEL, socialStatus, vatStatus } from "../domain/thresholds";

export default function Dashboard() {
  const settings = useSettings();
  const overview = useOverview();
  const transactions = useTransactions();
  const sessions = useSessions();
  const inform = useInform();
  const invoices = useInvoices();

  if (!settings || !overview || !transactions || !sessions || !inform || !invoices) {
    return <Empty>Laden…</Empty>;
  }

  const now = today();
  const yearStart = startOfYear();
  const monthStart = startOfMonth();
  const weekStart = startOfWeek();

  const ownRevenueYear = transactions.filter((t) => t.date >= yearStart).reduce((s, t) => s + t.amount, 0);
  const informRevenueYear = inform.filter((e) => e.date >= yearStart).reduce((s, e) => s + e.amount, 0);
  const revenueYear = ownRevenueYear + informRevenueYear;

  const revenueMonth =
    transactions.filter((t) => t.date >= monthStart).reduce((s, t) => s + t.amount, 0) +
    inform.filter((e) => e.date >= monthStart).reduce((s, e) => s + e.amount, 0);

  const outstanding =
    transactions.filter((t) => !t.paid).reduce((s, t) => s + t.amount, 0) +
    invoices.filter((i) => i.status !== "Betaald" && i.status !== "Geannuleerd").reduce((s, i) => s + i.amount, 0);

  const chargeable = sessions.filter((s) => isChargeable(s.status));
  const sessionsWeek = chargeable.filter((s) => s.date >= weekStart && s.date <= now).length;
  const sessionsMonth = chargeable.filter((s) => s.date >= monthStart).length;
  const sessionsYear = chargeable.filter((s) => s.date >= yearStart).length;

  const activeClients = overview.filter((o) => o.client.status === "Actief").length;

  const vat = vatStatus(revenueYear, settings);
  const social = socialStatus(revenueYear, settings);

  // Action list — the things worth doing something about today.
  const expiringSoon = overview.filter(
    (o) =>
      o.ledger.available > 0 &&
      o.ledger.nextExpiry &&
      daysBetween(now, o.ledger.nextExpiry) <= settings.packExpiryWarningDays,
  );
  const outOfCredits = overview.filter((o) => o.client.status === "Actief" && o.ledger.available === 0);
  const evaluationsDue = overview.filter(
    (o) =>
      o.client.nextEvaluation &&
      o.client.nextEvaluation <= addDays(now, settings.evaluationLookaheadDays),
  );
  const unpaid = transactions.filter((t) => !t.paid);
  const uninvoicedInform = inform.filter((e) => !e.invoiced);

  return (
    <>
      <h1>Dashboard {new Date().getFullYear()}</h1>
      <p className="sub">Alles wat je vandaag moet weten, in één scherm.</p>

      {!settings.businessName && (
        <Link to="/instellingen" className="alert" style={{ textDecoration: "none", color: "inherit", display: "block", marginBottom: 16 }}>
          <strong>Vul je bedrijfsgegevens in</strong> — naam, adres en IBAN zijn nodig voor je facturen.
        </Link>
      )}

      <div className="grid">
        <Kpi label="Omzet deze maand" value={formatEuro(revenueMonth)} />
        <Kpi label="Omzet dit jaar" value={formatEuro(revenueYear)} />
        <Kpi label="Openstaand" value={formatEuro(outstanding)} />
        <Kpi label="Actieve klanten" value={activeClients} />
      </div>

      <h2>Trainingen</h2>
      <div className="grid">
        <Kpi label="Sessies deze week" value={sessionsWeek} />
        <Kpi label="Sessies deze maand" value={sessionsMonth} />
        <Kpi label="Sessies dit jaar" value={sessionsYear} />
        <Kpi label="Omzet IN FORM" value={formatEuro(informRevenueYear)} small />
      </div>

      <h2>Grensbewaking</h2>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Card>
          <div className="row-between">
            <strong>BTW-vrijstelling</strong>
            <Badge tone={vat.level}>{LEVEL_LABEL[vat.level]}</Badge>
          </div>
          <Meter ratio={vat.ratio} level={vat.level} />
          <div className="item-sub">
            {formatEuro(vat.used)} van {formatEuro(vat.limit)} gebruikt ({Math.round(vat.ratio * 100)}%)
          </div>
          <div className="item-sub">
            Nog {formatEuro(Math.max(0, vat.remaining))} ruimte — wettelijke grens{" "}
            {formatEuro(settings.vatThreshold)}, marge {formatEuro(settings.vatSafetyMargin)}.
          </div>
        </Card>

        <Card>
          <div className="row-between">
            <strong>Sociale bijdrage</strong>
            <Badge tone={social.exempt ? "ok" : social.level}>
              {social.exempt ? "Vrijstelling mogelijk" : LEVEL_LABEL[social.level]}
            </Badge>
          </div>
          <Meter ratio={social.ratio} level={social.level} />
          <div className="item-sub">
            Geschatte netto winst {formatEuro(social.netProfit)} (omzet − {formatEuro(settings.estimatedBusinessCosts)} kosten)
          </div>
          <div className="item-sub">
            Vrijstellingsgrens {formatEuro(social.exemptionThreshold)} · hoofdberoepgrens {formatEuro(social.limit)}
          </div>
        </Card>
      </div>

      <h2>Actiepunten</h2>
      <div className="stack">
        {expiringSoon.map((o) => (
          <Link key={`exp-${o.client.id}`} to={`/klanten/${o.client.id}`} className="alert" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <strong>{o.client.name}</strong> — {o.ledger.available} credits vervallen op{" "}
            {formatDateShort(o.ledger.nextExpiry)}
          </Link>
        ))}
        {outOfCredits.map((o) => (
          <Link key={`op-${o.client.id}`} to={`/klanten/${o.client.id}`} className="alert crit" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <strong>{o.client.name}</strong> — {SIGNAL_LABEL[o.signal].toLowerCase()}, tijd voor een nieuw pakket
          </Link>
        ))}
        {evaluationsDue.map((o) => (
          <Link key={`ev-${o.client.id}`} to={`/klanten/${o.client.id}`} className="alert" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <strong>{o.client.name}</strong> — evaluatie gepland op {formatDateShort(o.client.nextEvaluation)}
          </Link>
        ))}
        {unpaid.length > 0 && (
          <Link to="/verkopen" className="alert crit" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <strong>{unpaid.length} onbetaalde verkoop{unpaid.length === 1 ? "" : "en"}</strong> —{" "}
            {formatEuro(unpaid.reduce((s, t) => s + t.amount, 0))} openstaand
          </Link>
        )}
        {uninvoicedInform.length > 0 && (
          <Link to="/inform" className="alert" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
            <strong>{uninvoicedInform.length} IN FORM-uren nog niet gefactureerd</strong> —{" "}
            {formatEuro(uninvoicedInform.reduce((s, e) => s + e.amount, 0))}
          </Link>
        )}
        {expiringSoon.length === 0 &&
          outOfCredits.length === 0 &&
          evaluationsDue.length === 0 &&
          unpaid.length === 0 &&
          uninvoicedInform.length === 0 && <Empty>Niets dat je aandacht vraagt. 🎉</Empty>}
      </div>
    </>
  );
}
