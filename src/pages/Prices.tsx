import { useState } from "react";
import { Badge, Empty, Field, Modal } from "../components/ui";
import { db } from "../db/db";
import { INFORM_SESSION_TYPES, type InformSessionType, type PriceItem } from "../db/schema";
import { formatDateShort, formatEuro, today } from "../domain/dates";
import { appliesOn, priceHistory, repriceItem } from "../domain/pricing";
import { usePrices, useSettings } from "../hooks/useData";

export default function Prices() {
  const prices = usePrices();
  const settings = useSettings();
  const [repricing, setRepricing] = useState<PriceItem | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);

  if (!prices || !settings) return <Empty>Laden…</Empty>;

  const now = today();
  const current = prices.filter((p) => p.active && appliesOn(p, now));

  const byLocation = new Map<string, PriceItem[]>();
  for (const p of current) {
    byLocation.set(p.location, [...(byLocation.get(p.location) ?? []), p]);
  }

  return (
    <>
      <h1>Prijzen</h1>
      <p className="sub">
        Een prijs wijzigen maakt een nieuwe versie aan vanaf een datum die je kiest. De oude versie
        blijft bestaan, zodat verkopen uit het verleden hun oorspronkelijke bedrag houden.
      </p>

      {[...byLocation.entries()].map(([location, items]) => (
        <div key={location}>
          <h2>{location}</h2>
          <div className="list">
            {items.map((p) => {
              const versions = priceHistory(prices, p.baseCode).length;
              return (
                <button key={p.code} onClick={() => setRepricing(p)}>
                  <div>
                    <div className="item-title">
                      {p.sessionType} · {p.product}
                    </div>
                    <div className="item-sub">
                      {p.baseCode} · {p.credits} credit{p.credits === 1 ? "" : "s"} ·{" "}
                      {p.validityMonths > 0 ? `${p.validityMonths} maanden geldig` : "geen vervaldatum"}
                      {p.activeFrom && ` · sinds ${formatDateShort(p.activeFrom)}`}
                    </div>
                    {versions > 1 && (
                      <div
                        className="item-sub"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryOf(p.baseCode);
                        }}
                        style={{ textDecoration: "underline" }}
                      >
                        {versions} prijsversies — bekijk historiek
                      </div>
                    )}
                  </div>
                  <strong>{formatEuro(p.amount)}</strong>
                </button>
              );
            })}
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
      <p className="sub" style={{ marginTop: 10 }}>
        IN FORM-tarieven worden wel rechtstreeks aangepast: die staan al vast op de prestatie zelf
        zodra ze geregistreerd is.
      </p>

      {repricing && <RepriceModal item={repricing} onClose={() => setRepricing(null)} />}
      {historyOf && (
        <HistoryModal
          versions={priceHistory(prices, historyOf)}
          onClose={() => setHistoryOf(null)}
        />
      )}
    </>
  );
}

function RepriceModal({ item, onClose }: { item: PriceItem; onClose: () => void }) {
  const [amount, setAmount] = useState(String(item.amount));
  const [from, setFrom] = useState(today());
  const value = Number(amount);
  const unchanged = value === item.amount;

  async function save() {
    if (!value || value <= 0 || unchanged) return;
    const { closed, opened } = repriceItem(item, value, from);
    await db.transaction("rw", db.prices, async () => {
      await db.prices.put(closed);
      await db.prices.put(opened);
    });
    onClose();
  }

  return (
    <Modal title={`${item.sessionType} · ${item.product}`} onClose={onClose}>
      <p className="sub">
        {item.location} · {item.baseCode} · nu {formatEuro(item.amount)}
      </p>
      <Field label="Nieuw bedrag (€)">
        <input
          autoFocus
          type="number"
          step="1"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field label="Geldig vanaf">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
      <div className="alert" style={{ marginBottom: 12, borderLeftColor: "var(--accent)" }}>
        De huidige prijs loopt tot {formatDateShort(from)} en blijft bewaard. Verkopen van vóór die
        datum houden {formatEuro(item.amount)}.
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>Annuleer</button>
        <button className="btn-primary" onClick={save} disabled={unchanged || value <= 0}>
          Prijs wijzigen
        </button>
      </div>
    </Modal>
  );
}

function HistoryModal({ versions, onClose }: { versions: PriceItem[]; onClose: () => void }) {
  return (
    <Modal title={`Prijshistoriek ${versions[0]?.baseCode ?? ""}`} onClose={onClose}>
      <div className="list">
        {versions.map((v) => (
          <div key={v.code}>
            <div>
              <div className="item-title">{formatEuro(v.amount)}</div>
              <div className="item-sub">
                {v.activeFrom ? `vanaf ${formatDateShort(v.activeFrom)}` : "vanaf het begin"}
                {v.activeUntil ? ` tot ${formatDateShort(v.activeUntil)}` : ""}
              </div>
            </div>
            <Badge tone={v.active ? "ok" : ""}>{v.active ? "Actief" : "Historisch"}</Badge>
          </div>
        ))}
      </div>
      <button className="btn-block" style={{ marginTop: 14 }} onClick={onClose}>
        Sluiten
      </button>
    </Modal>
  );
}
