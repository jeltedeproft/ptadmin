import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, Empty, Kpi, Meter } from "../components/ui";
import { useInform, useInvoices, useOverview, useSessions, useSettings, useTransactions } from "../hooks/useData";
import {
  currentMonthKey,
  formatDateShort,
  formatEuro,
  formatMonth,
  shiftMonthKey,
} from "../domain/dates";
import { buildReport } from "../domain/reporting";
import { LEVEL_LABEL, socialStatus, vatStatus } from "../domain/thresholds";

export default function Dashboard() {
  const settings = useSettings();
  const overview = useOverview();
  const transactions = useTransactions();
  const sessions = useSessions();
  const inform = useInform();
  const invoices = useInvoices();
  const [month, setMonth] = useState(currentMonthKey());

  const report = useMemo(() => {
    if (!settings || !overview || !transactions || !sessions || !inform || !invoices) return null;
    return buildReport(month, { overview, transactions, sessions, inform, invoices }, settings);
  }, [month, settings, overview, transactions, sessions, inform, invoices]);

  if (!report || !settings) return <Empty>Laden…</Empty>;

  const isCurrentMonth = month === currentMonthKey();
  const vat = vatStatus(report.revenue.year, settings);
  const social = socialStatus(report.revenue.year, settings);
  const { clients, sessions: sess, revenue } = report;

  return (
    <>
      <h1>Dashboard</h1>

      <div className="monthnav">
        <button aria-label="Vorige maand" onClick={() => setMonth(shiftMonthKey(month, -1))}>
          ‹
        </button>
        <div className="monthnav-label">
          <strong>{formatMonth(month)}</strong>
          {!isCurrentMonth && (
            <button className="btn-sm" onClick={() => setMonth(currentMonthKey())}>
              Vandaag
            </button>
          )}
        </div>
        <button aria-label="Volgende maand" onClick={() => setMonth(shiftMonthKey(month, 1))}>
          ›
        </button>
      </div>

      {!settings.businessName && (
        <Link to="/instellingen" className="alert" style={linkAlert}>
          <strong>Vul je bedrijfsgegevens in</strong> — naam, adres en IBAN zijn nodig voor je facturen.
        </Link>
      )}

      <div className="grid">
        <Kpi label={`Omzet ${formatMonth(month)}`} value={formatEuro(revenue.month)} />
        <Kpi label={`Omzet ${report.year}`} value={formatEuro(revenue.year)} />
        <Kpi label="Openstaand" value={formatEuro(report.outstanding)} />
        <Kpi label="Actieve klanten" value={clients.active} />
        <Kpi label="Sessies deze week" value={sess.week} />
        <Kpi label="Ruimte tot btw-grens" value={formatEuro(Math.max(0, vat.remaining))} small />
      </div>

      <h2>Business</h2>
      <div className="grid">
        <Kpi label="Omzet eigen klanten" value={formatEuro(revenue.own)} small />
        <Kpi label="Omzet IN FORM" value={formatEuro(revenue.inform)} small />
        <Kpi label={`Ontvangen ${formatMonth(month)}`} value={formatEuro(revenue.receivedMonth)} small />
        <Kpi label="Gemiddelde maandomzet" value={formatEuro(revenue.averageMonth)} small />
        <Kpi label="Geschatte jaaromzet" value={formatEuro(revenue.projectedYear)} small />
      </div>

      <h2>Klanten</h2>
      <div className="grid">
        <Kpi label="Actief" value={clients.active} />
        <Kpi label="Gepauzeerd" value={clients.paused} />
        <Kpi label="Stopgezet" value={clients.stopped} />
        <Kpi label={`Nieuw in ${formatMonth(month)}`} value={clients.newInMonth.length} />
        <Kpi label="Evaluaties deze maand" value={clients.evaluationsInMonth.length} />
        <Kpi label="Weinig credits" value={clients.lowCredits.length} />
      </div>

      <h2>Trainingen</h2>
      <div className="grid">
        <Kpi label="Sessies deze week" value={sess.week} />
        <Kpi label={`Sessies ${formatMonth(month)}`} value={sess.month} />
        <Kpi label={`Sessies ${report.year}`} value={sess.year} />
      </div>
      {sess.month > 0 && (
        <Card className="stack" style={{ marginTop: 10 }}>
          <Split label="Per type" counts={sess.byType} />
          <Split label="Per locatie" counts={sess.byLocation} />
        </Card>
      )}

      <h2>Grensbewaking {report.year}</h2>
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
          <div className="item-sub">
            Verwacht op jaareinde: {formatEuro(revenue.projectedYear)}
            {revenue.projectedYear > vat.limit && " — dat gaat over de veilige grens."}
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
            Geschat netto beroepsinkomen {formatEuro(social.netProfit)} (omzet −{" "}
            {formatEuro(settings.estimatedBusinessCosts)} geschatte kosten)
          </div>
          <div className="item-sub">
            Vrijstellingsgrens {formatEuro(social.exemptionThreshold)} · hoofdberoepgrens{" "}
            {formatEuro(social.limit)}
          </div>
          <div className="item-sub muted">Dit is een raming, geen exacte fiscale berekening.</div>
        </Card>
      </div>

      <h2>Actiepunten</h2>
      <Actions report={report} settings={settings} />
    </>
  );
}

const linkAlert = {
  textDecoration: "none",
  color: "inherit",
  display: "block",
} as const;

function Split({ label, counts }: { label: string; counts: Record<string, number | undefined> }) {
  const entries = Object.entries(counts).filter(([, n]) => n);
  if (entries.length === 0) return null;
  return (
    <div className="row-between">
      <span className="muted">{label}</span>
      <span>{entries.map(([k, n]) => `${k} ${n}`).join(" · ")}</span>
    </div>
  );
}

function Action({ to, crit, children }: { to: string; crit?: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={`alert${crit ? " crit" : ""}`} style={linkAlert}>
      {children}
    </Link>
  );
}

function Actions({
  report,
  settings,
}: {
  report: ReturnType<typeof buildReport>;
  settings: { inactiveDays: number; packExpiryWarningDays: number };
}) {
  const { clients, unpaidTransactions, uninvoicedInform, overdueInvoices, unsentInvoices } = report;
  const items: ReactNode[] = [];

  for (const i of overdueInvoices) {
    items.push(
      <Action key={`inv-${i.id}`} to="/facturen" crit>
        <strong>Factuur {i.number} is te laat</strong> — {formatEuro(i.amount)}, verviel{" "}
        {formatDateShort(i.dueDate)}
      </Action>,
    );
  }
  if (unpaidTransactions.length > 0) {
    items.push(
      <Action key="unpaid" to="/verkopen" crit>
        <strong>
          {unpaidTransactions.length} onbetaalde verkoop{unpaidTransactions.length === 1 ? "" : "en"}
        </strong>{" "}
        — {formatEuro(unpaidTransactions.reduce((s, t) => s + t.amount, 0))} openstaand
      </Action>,
    );
  }
  for (const o of clients.needsPack) {
    items.push(
      <Action key={`pack-${o.client.id}`} to={`/klanten/${o.client.id}`} crit>
        <strong>{o.client.name}</strong> — nieuw pakket nodig
      </Action>,
    );
  }
  for (const o of clients.expiringPacks) {
    items.push(
      <Action key={`exp-${o.client.id}`} to={`/klanten/${o.client.id}`}>
        <strong>{o.client.name}</strong> — {o.ledger.available} credits vervallen op{" "}
        {formatDateShort(o.ledger.nextExpiry)}
      </Action>,
    );
  }
  for (const o of clients.lowCredits) {
    items.push(
      <Action key={`low-${o.client.id}`} to={`/klanten/${o.client.id}`}>
        <strong>{o.client.name}</strong> — nog {o.ledger.available} credit
        {o.ledger.available === 1 ? "" : "s"}
      </Action>,
    );
  }
  for (const o of clients.inactive) {
    items.push(
      <Action key={`inact-${o.client.id}`} to={`/klanten/${o.client.id}`}>
        <strong>{o.client.name}</strong> — al {settings.inactiveDays}+ dagen niet getraind
      </Action>,
    );
  }
  for (const o of clients.evaluationsSoon) {
    items.push(
      <Action key={`ev-${o.client.id}`} to={`/klanten/${o.client.id}`}>
        <strong>{o.client.name}</strong> — evaluatie op {formatDateShort(o.client.nextEvaluation)}
      </Action>,
    );
  }
  if (uninvoicedInform.length > 0) {
    items.push(
      <Action key="inform" to="/inform">
        <strong>{uninvoicedInform.length} IN FORM-uren nog niet gefactureerd</strong> —{" "}
        {formatEuro(uninvoicedInform.reduce((s, e) => s + e.amount, 0))}
      </Action>,
    );
  }
  for (const i of unsentInvoices) {
    items.push(
      <Action key={`send-${i.id}`} to="/facturen">
        <strong>Factuur {i.number} is gemaakt maar nog niet verstuurd</strong>
      </Action>,
    );
  }

  if (items.length === 0) return <Empty>Niets dat je aandacht vraagt. 🎉</Empty>;
  return <div className="stack">{items}</div>;
}
