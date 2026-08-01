import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, Empty, Hero, Kpi, Meter } from "../components/ui";
import {
  useInform,
  useInvoices,
  useLeads,
  useOverview,
  useSessions,
  useSettings,
  useTransactions,
} from "../hooks/useData";
import {
  currentMonthKey,
  formatDateShort,
  formatEuro,
  formatMonth,
  shiftMonthKey,
} from "../domain/dates";
import { buildMonthlySeries, buildReport } from "../domain/reporting";
import { Columns, LineTrend, StackedColumns, monthLabel } from "../components/charts";
import { LEVEL_LABEL, socialStatus, vatStatus } from "../domain/thresholds";

/** Axis ticks and tooltips: whole euros, thousands as "12k". */
const compactEuro = (n: number) =>
  n >= 1000 ? `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `€${Math.round(n)}`;
const whole = (n: number) => String(Math.round(n));

export default function Dashboard() {
  const settings = useSettings();
  const overview = useOverview();
  const transactions = useTransactions();
  const sessions = useSessions();
  const inform = useInform();
  const invoices = useInvoices();
  const leads = useLeads();
  const [month, setMonth] = useState(currentMonthKey());

  const data = useMemo(
    () =>
      settings && overview && transactions && sessions && inform && invoices
        ? { overview, transactions, sessions, inform, invoices, leads }
        : null,
    [settings, overview, transactions, sessions, inform, invoices, leads],
  );

  const report = useMemo(
    () => (data && settings ? buildReport(month, data, settings) : null),
    [month, data, settings],
  );
  const chartRows = useMemo(
    () => (data && report ? buildMonthlySeries(report.year, data) : []),
    [data, report],
  );

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

      {/* Tier 1 — the one number that answers "hoe sta ik ervoor". */}
      <Hero
        label={`Omzet ${formatMonth(month)}`}
        value={formatEuro(revenue.month)}
        delta={deltaOf(revenue.month, revenue.previousMonth)}
        context={`${formatEuro(revenue.year)} in ${report.year}`}
      />

      {/* Tier 2 — the handful he acts on. */}
      <div className="grid" style={{ marginTop: 10 }}>
        <Kpi
          label="Openstaand"
          value={formatEuro(report.outstanding)}
          size="lg"
          sub={report.overdueInvoices.length > 0 ? `${report.overdueInvoices.length} te laat` : undefined}
        />
        <Kpi label="Sessies deze week" value={sess.week} size="lg" />
        <Kpi
          label="Actieve klanten"
          value={clients.active}
          size="lg"
          sub={clients.newInMonth.length > 0 ? `+${clients.newInMonth.length} deze maand` : undefined}
        />
      </div>

      <h2>Actiepunten</h2>
      <Actions report={report} settings={settings} />

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

      {/* Tier 3 — supporting detail, folded away so it stops competing. */}
      <details className="more">
        <summary>Alle cijfers</summary>

        <h3>Business</h3>
        <div className="grid">
          <Kpi label="Omzet eigen klanten" value={formatEuro(revenue.own)} size="sm" />
          <Kpi label="Omzet IN FORM" value={formatEuro(revenue.inform)} size="sm" />
          <Kpi label={`Ontvangen ${formatMonth(month)}`} value={formatEuro(revenue.receivedMonth)} size="sm" />
          <Kpi label="Gemiddelde maandomzet" value={formatEuro(revenue.averageMonth)} size="sm" />
          <Kpi label="Geschatte jaaromzet" value={formatEuro(revenue.projectedYear)} size="sm" />
        </div>

        <h3>Klanten</h3>
        <div className="grid">
          <Kpi label="Gepauzeerd" value={clients.paused} size="sm" />
          <Kpi label="Stopgezet" value={clients.stopped} size="sm" />
          <Kpi label={`Nieuw in ${formatMonth(month)}`} value={clients.newInMonth.length} size="sm" />
          <Kpi label="Evaluaties deze maand" value={clients.evaluationsInMonth.length} size="sm" />
          <Kpi label="Weinig credits" value={clients.lowCredits.length} size="sm" />
        </div>

        <h3>Trainingen</h3>
        <div className="grid">
          <Kpi label={`Sessies ${formatMonth(month)}`} value={sess.month} size="sm" />
          <Kpi label={`Sessies ${report.year}`} value={sess.year} size="sm" />
        </div>
        {sess.month > 0 && (
          <Card className="stack" style={{ marginTop: 10 }}>
            <Split label="Per type" counts={sess.byType} />
            <Split label="Per locatie" counts={sess.byLocation} />
          </Card>
        )}
      </details>

      <h2 id="grafieken">Grafieken {report.year}</h2>
      <StackedColumns
        title="Omzet per maand"
        subtitle="Eigen klanten tegenover IN FORM"
        rows={chartRows.map((r, i) => ({ key: r.key, label: monthLabel(i), values: [r.own, r.inform] }))}
        names={["Eigen klanten", "IN FORM"]}
        format={compactEuro}
      />
      <Columns
        title="Sessies per maand"
        subtitle="Aangerekende sessies"
        rows={chartRows.map((r, i) => ({ key: r.key, label: monthLabel(i), values: [r.sessions] }))}
        valueName="Sessies"
        format={whole}
      />
      <LineTrend
        title="Actieve klanten per maand"
        subtitle="Klanten met minstens één training in die maand"
        rows={chartRows.map((r, i) => ({ key: r.key, label: monthLabel(i), values: [r.activeClients] }))}
        valueName="Klanten"
        format={whole}
      />
    </>
  );
}

const linkAlert = {
  textDecoration: "none",
  color: "inherit",
  display: "block",
} as const;

/** Month-on-month change for the hero figure. */
function deltaOf(now: number, before: number): { text: string; good: boolean | null } | undefined {
  if (before === 0) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "gelijk aan vorige maand", good: null };
  return {
    text: `${pct > 0 ? "+" : ""}${pct}% tegenover vorige maand`,
    good: pct > 0,
  };
}

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

/** Urgency drives size: "nu" reads as a headline, "binnenkort" as a footnote. */
type Urgency = "nu" | "binnenkort";

interface ActionItem {
  key: string;
  to: string;
  urgency: Urgency;
  node: ReactNode;
}

function Actions({
  report,
  settings,
}: {
  report: ReturnType<typeof buildReport>;
  settings: { inactiveDays: number; packExpiryWarningDays: number };
}) {
  const { clients, unpaidTransactions, uninvoicedInform, overdueInvoices, unsentInvoices, leadsDue } =
    report;
  const items: ActionItem[] = [];
  const add = (key: string, to: string, urgency: Urgency, node: ReactNode) =>
    items.push({ key, to, urgency, node });

  // Money already late — the top of the list, always.
  for (const i of overdueInvoices) {
    add(`inv-${i.id}`, "/facturen", "nu", (
      <>
        <strong>Factuur {i.number} is te laat</strong> — {formatEuro(i.amount)}, verviel{" "}
        {formatDateShort(i.dueDate)}
      </>
    ));
  }
  if (unpaidTransactions.length > 0) {
    add("unpaid", "/verkopen", "nu", (
      <>
        <strong>
          {unpaidTransactions.length} onbetaalde verkoop{unpaidTransactions.length === 1 ? "" : "en"}
        </strong>{" "}
        — {formatEuro(unpaidTransactions.reduce((s, t) => s + t.amount, 0))} openstaand
      </>
    ));
  }
  for (const o of clients.needsPack) {
    add(`pack-${o.client.id}`, `/klanten/${o.client.id}`, "nu", (
      <>
        <strong>{o.client.name}</strong> — nieuw pakket nodig
      </>
    ));
  }
  for (const l of leadsDue) {
    add(`lead-${l.id}`, "/leads", "nu", (
      <>
        <strong>{l.name}</strong> — lead opvolgen ({l.status.toLowerCase()})
      </>
    ));
  }

  for (const o of clients.expiringPacks) {
    add(`exp-${o.client.id}`, `/klanten/${o.client.id}`, "binnenkort", (
      <>
        <strong>{o.client.name}</strong> — {o.ledger.available} credits vervallen op{" "}
        {formatDateShort(o.ledger.nextExpiry)}
      </>
    ));
  }
  for (const o of clients.lowCredits) {
    add(`low-${o.client.id}`, `/klanten/${o.client.id}`, "binnenkort", (
      <>
        <strong>{o.client.name}</strong> — nog {o.ledger.available} credit
        {o.ledger.available === 1 ? "" : "s"}
      </>
    ));
  }
  for (const o of clients.inactive) {
    add(`inact-${o.client.id}`, `/klanten/${o.client.id}`, "binnenkort", (
      <>
        <strong>{o.client.name}</strong> — al {settings.inactiveDays}+ dagen niet getraind
      </>
    ));
  }
  for (const o of clients.evaluationsSoon) {
    add(`ev-${o.client.id}`, `/klanten/${o.client.id}`, "binnenkort", (
      <>
        <strong>{o.client.name}</strong> — evaluatie op {formatDateShort(o.client.nextEvaluation)}
      </>
    ));
  }
  if (uninvoicedInform.length > 0) {
    add("inform", "/inform", "binnenkort", (
      <>
        <strong>{uninvoicedInform.length} IN FORM-uren nog niet gefactureerd</strong> —{" "}
        {formatEuro(uninvoicedInform.reduce((s, e) => s + e.amount, 0))}
      </>
    ));
  }
  for (const i of unsentInvoices) {
    add(`send-${i.id}`, "/facturen", "binnenkort", (
      <>
        <strong>Factuur {i.number}</strong> is gemaakt maar nog niet verstuurd
      </>
    ));
  }

  if (items.length === 0) return <Empty>Niets dat je aandacht vraagt. 🎉</Empty>;

  const now = items.filter((i) => i.urgency === "nu");
  const soon = items.filter((i) => i.urgency === "binnenkort");

  return (
    <>
      {now.length > 0 && (
        <div className="stack">
          {now.map((i) => (
            <Link key={i.key} to={i.to} className="alert crit action-now" style={linkAlert}>
              {i.node}
            </Link>
          ))}
        </div>
      )}
      {soon.length > 0 && (
        <>
          <h3 className="action-head">Binnenkort</h3>
          <div className="stack">
            {soon.map((i) => (
              <Link key={i.key} to={i.to} className="alert action-soon" style={linkAlert}>
                {i.node}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
