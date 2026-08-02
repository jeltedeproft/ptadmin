import { useMemo, useState } from "react";
import { Card, Empty, Kpi } from "../components/ui";
import { Columns, StackedColumns, monthLabel } from "../components/charts";
import { EXPORTS, exportCsv } from "../domain/csv";
import { isChargeable } from "../domain/credits";
import { formatEuro, formatMonth, monthKey, monthsElapsed, today } from "../domain/dates";
import { buildMonthlySeries } from "../domain/reporting";
import { socialStatus, vatStatus } from "../domain/thresholds";
import {
  useInform,
  useInvoices,
  useOverview,
  useSessions,
  useSettings,
  useTransactions,
} from "../hooks/useData";

const compactEuro = (n: number) =>
  n >= 1000 ? `€${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `€${Math.round(n)}`;
const whole = (n: number) => String(Math.round(n));

/**
 * Year figures, the ones that only make sense over a longer stretch: what a
 * client is worth, where the revenue comes from, and how the year is tracking
 * against the thresholds.
 */
export default function Reports() {
  const settings = useSettings();
  const overview = useOverview();
  const transactions = useTransactions();
  const sessions = useSessions();
  const inform = useInform();
  const invoices = useInvoices();
  const [year, setYear] = useState(new Date().getFullYear());

  const data = useMemo(
    () =>
      overview && transactions && sessions && inform && invoices
        ? { overview, transactions, sessions, inform, invoices }
        : null,
    [overview, transactions, sessions, inform, invoices],
  );
  const months = useMemo(() => (data ? buildMonthlySeries(year, data) : []), [data, year]);

  if (!settings || !data) return <Empty>Laden…</Empty>;

  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const inYear = <T extends { date: string }>(rows: T[]) =>
    rows.filter((r) => r.date >= from && r.date <= to);

  const yearTx = inYear(data.transactions);
  const yearSessions = inYear(data.sessions).filter((s) => isChargeable(s.status));
  const revenue = months.reduce((s, m) => s + m.total, 0);
  const ownRevenue = months.reduce((s, m) => s + m.own, 0);

  const payingClients = new Set(yearTx.map((t) => t.clientId));
  const perClient = payingClients.size > 0 ? ownRevenue / payingClients.size : 0;
  const perSession = yearSessions.length > 0 ? ownRevenue / yearSessions.length : 0;

  // Which products actually sell.
  const byProduct = new Map<string, { count: number; revenue: number }>();
  for (const t of yearTx) {
    const key = `${t.location} · ${t.sessionType} · ${t.product}`;
    const e = byProduct.get(key) ?? { count: 0, revenue: 0 };
    e.count += 1;
    e.revenue += t.amount;
    byProduct.set(key, e);
  }
  const products = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue);

  const best = [...data.overview]
    .map((o) => ({
      name: o.client.name,
      revenue: yearTx.filter((t) => t.clientId === o.client.id).reduce((s, t) => s + t.amount, 0),
      sessions: yearSessions.filter((s) => s.clientId === o.client.id).length,
    }))
    .filter((r) => r.revenue > 0 || r.sessions > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const vat = vatStatus(revenue, settings);
  const social = socialStatus(revenue, settings);
  const elapsed = monthsElapsed(year, today());
  const busiest = months.reduce((a, b) => (b.total > a.total ? b : a), months[0]);

  return (
    <>
      <h1>Rapporten</h1>

      <div className="monthnav">
        <button aria-label="Vorig jaar" onClick={() => setYear(year - 1)}>
          ‹
        </button>
        <div className="monthnav-label">
          <strong>{year}</strong>
        </div>
        <button aria-label="Volgend jaar" onClick={() => setYear(year + 1)}>
          ›
        </button>
      </div>

      <div className="grid">
        <Kpi label={`Omzet ${year}`} value={formatEuro(revenue)} size="lg" />
        <Kpi label="Sessies" value={yearSessions.length} size="lg" />
        <Kpi label="Betalende klanten" value={payingClients.size} size="lg" />
      </div>

      <h2>Per klant en per sessie</h2>
      <div className="grid">
        <Kpi label="Gemiddeld per klant" value={formatEuro(perClient)} size="sm" />
        <Kpi label="Gemiddeld per sessie" value={formatEuro(perSession)} size="sm" />
        <Kpi
          label="Sessies per klant"
          value={payingClients.size ? (yearSessions.length / payingClients.size).toFixed(1) : "0"}
          size="sm"
        />
        <Kpi
          label="Drukste maand"
          value={busiest && busiest.total > 0 ? formatMonth(busiest.key) : "—"}
          size="sm"
        />
      </div>

      <h2>Verloop</h2>
      <StackedColumns
        title="Omzet per maand"
        subtitle="Eigen klanten tegenover IN FORM"
        rows={months.map((m, i) => ({ key: m.key, label: monthLabel(i), values: [m.own, m.inform] }))}
        names={["Eigen klanten", "IN FORM"]}
        format={compactEuro}
      />
      <Columns
        title="Sessies per maand"
        rows={months.map((m, i) => ({ key: m.key, label: monthLabel(i), values: [m.sessions] }))}
        valueName="Sessies"
        format={whole}
      />

      <h2>Wat verkoopt</h2>
      {products.length === 0 ? (
        <Empty>Nog geen verkopen in {year}.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="datatable">
            <thead>
              <tr>
                <th>Product</th>
                <th>Aantal</th>
                <th>Omzet</th>
                <th>Aandeel</th>
              </tr>
            </thead>
            <tbody>
              {products.map(([key, v]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{v.count}</td>
                  <td>{formatEuro(v.revenue)}</td>
                  <td>{ownRevenue ? Math.round((v.revenue / ownRevenue) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Per klant</h2>
      {best.length === 0 ? (
        <Empty>Nog geen activiteit in {year}.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="datatable">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Sessies</th>
                <th>Omzet</th>
              </tr>
            </thead>
            <tbody>
              {best.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.sessions}</td>
                  <td>{formatEuro(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Fiscaal beeld {year}</h2>
      <Card className="stack">
        <div className="row-between">
          <span className="muted">Omzet</span>
          <strong>{formatEuro(revenue)}</strong>
        </div>
        <div className="row-between">
          <span className="muted">Btw-ruimte over</span>
          <span>{formatEuro(Math.max(0, vat.remaining))}</span>
        </div>
        <div className="row-between">
          <span className="muted">Geschat netto beroepsinkomen</span>
          <span>{formatEuro(social.netProfit)}</span>
        </div>
        <div className="row-between">
          <span className="muted">Gemiddelde maandomzet</span>
          <span>{formatEuro(elapsed > 0 ? revenue / elapsed : 0)}</span>
        </div>
        <div className="item-sub muted">
          Ramingen op basis van de ingestelde grenzen, geen fiscale berekening.
        </div>
      </Card>

      <h2>Exporteren</h2>
      <p className="sub">Alles als CSV, om door te geven aan je boekhouder.</p>
      <div className="list">
        {EXPORTS.map((e) => (
          <button key={e.kind} onClick={() => exportCsv(e.kind)}>
            <div>
              <div className="item-title">{e.label}</div>
              <div className="item-sub">{e.hint}</div>
            </div>
            <span className="muted">CSV ↓</span>
          </button>
        ))}
      </div>

      <p className="sub" style={{ marginTop: 16 }}>
        Cijfers over {monthKey(today()).slice(0, 4) === String(year) ? `${elapsed} maanden` : "het volledige jaar"}.
      </p>
    </>
  );
}
