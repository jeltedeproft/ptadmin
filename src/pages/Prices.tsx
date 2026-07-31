import { Empty } from "../components/ui";
import { db } from "../db/db";
import { INFORM_SESSION_TYPES, type InformSessionType } from "../db/schema";
import { formatEuro } from "../domain/dates";
import { usePrices, useSettings } from "../hooks/useData";

export default function Prices() {
  const prices = usePrices();
  const settings = useSettings();

  if (!prices || !settings) return <Empty>Laden…</Empty>;

  const byLocation = new Map<string, typeof prices>();
  for (const p of prices) {
    byLocation.set(p.location, [...(byLocation.get(p.location) ?? []), p]);
  }

  return (
    <>
      <h1>Prijzen</h1>
      <p className="sub">Wijzigingen gelden voor nieuwe verkopen; bestaande blijven op hun oude bedrag staan.</p>

      {[...byLocation.entries()].map(([location, items]) => (
        <div key={location}>
          <h2>{location}</h2>
          <div className="list">
            {items.map((p) => (
              <div key={p.code}>
                <div>
                  <div className="item-title">
                    {p.sessionType} · {p.product}
                  </div>
                  <div className="item-sub">
                    {p.code} · {p.credits} credit{p.credits === 1 ? "" : "s"} ·{" "}
                    {p.validityMonths > 0 ? `${p.validityMonths} maanden geldig` : "geen vervaldatum"}
                  </div>
                </div>
                <div className="row">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={p.amount}
                    style={{ width: 96, textAlign: "right" }}
                    onChange={(e) => db.prices.update(p.code, { amount: Number(e.target.value) })}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2>IN FORM-uurtarieven</h2>
      <div className="list">
        {INFORM_SESSION_TYPES.map((type: InformSessionType) => (
          <div key={type}>
            <div className="item-title">{type}</div>
            <input
              type="number"
              step="1"
              min="0"
              value={settings.informRates[type]}
              style={{ width: 96, textAlign: "right" }}
              onChange={(e) =>
                db.settings.update(1, {
                  informRates: { ...settings.informRates, [type]: Number(e.target.value) },
                })
              }
            />
          </div>
        ))}
      </div>

      <p className="sub" style={{ marginTop: 20 }}>
        Losse sessie privéruimte solo staat momenteel op {formatEuro(prices.find((p) => p.code === "PR-SOLO-LOS")?.amount ?? 0)}.
      </p>
    </>
  );
}
