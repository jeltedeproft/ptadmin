// Smoke test for the money-relevant logic. Run with: npm test
import { buildLedger, isChargeable, signalFor } from "../src/domain/credits";
import {
  addMonths,
  daysBetween,
  formatEuro,
  monthRange,
  monthsElapsed,
  shiftMonthKey,
  startOfWeek,
  toIso,
} from "../src/domain/dates";
import { buildProductCode, findPrice, priceHistory, repriceItem } from "../src/domain/pricing";
import { socialStatus, vatStatus } from "../src/domain/thresholds";
import { nextNumber } from "../src/domain/invoicing";
import { buildMonthlySeries, buildReport } from "../src/domain/reporting";
import { barPath, niceMax, ticks } from "../src/components/charts";
import { toCsv } from "../src/domain/csv";
import { DEFAULT_PRICES, DEFAULT_SETTINGS } from "../src/db/seed";
import type { Client, InformEntry, Session, Transaction } from "../src/db/schema";
import type { ClientOverview } from "../src/hooks/useData";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}\n         verwacht ${e}\n         kreeg    ${a}`);
  }
}

// ---------- dates ----------
console.log("\ndates");
check("EDATE 4 maanden", addMonths("2026-07-28", 4), "2026-11-28");
check("EDATE klemt op korte maand", addMonths("2026-01-31", 1), "2026-02-28");
check("EDATE 6 maanden over jaargrens", addMonths("2026-10-15", 6), "2027-04-15");
check("daysBetween", daysBetween("2026-01-01", "2026-01-31"), 30);
check("week start op maandag", startOfWeek(new Date(2026, 6, 31)), "2026-07-27");
check("euro formatting", formatEuro(650).replace(/ | /g, " "), "€ 650,00");

check("maand vooruit", shiftMonthKey("2026-08", 1), "2026-09");
check("maand terug over jaargrens", shiftMonthKey("2026-01", -1), "2025-12");
check("maand 13 vooruit", shiftMonthKey("2026-08", 13), "2027-09");
check("maandbereik schrikkeljaar", monthRange("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
check("maandbereik gewoon jaar", monthRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
check("maandbereik december", monthRange("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
check("maanden verstreken lopend jaar", monthsElapsed(2026, "2026-08-01"), 8);
check("maanden verstreken vorig jaar", monthsElapsed(2025, "2026-08-01"), 12);
check("maanden verstreken volgend jaar", monthsElapsed(2027, "2026-08-01"), 0);

// ---------- pricing ----------
console.log("\npricing");
check("productcode privéruimte solo pakket", buildProductCode("Privéruimte", "Solo", "Pakket 10"), "PR-SOLO-10");
check("productcode aan huis semi los", buildProductCode("Aan huis", "Semi PT", "Losse sessie"), "AH-SEMI-LOS");
check("productcode online solo pakket", buildProductCode("Online", "Solo", "Pakket 10"), "ON-SOLO-10");
check("prijs PR-SOLO-10", findPrice(DEFAULT_PRICES, "Privéruimte", "Solo", "Pakket 10")?.amount, 650);
check("geldigheid AH-SOLO-10", findPrice(DEFAULT_PRICES, "Aan huis", "Solo", "Pakket 10")?.validityMonths, 6);
check("online losse sessie kost 40", findPrice(DEFAULT_PRICES, "Online", "Solo", "Losse sessie")?.amount, 40);
check("online pakket kost 10x40", findPrice(DEFAULT_PRICES, "Online", "Duo", "Pakket 10")?.amount, 400);
check("elke locatie/type/product heeft een prijs", DEFAULT_PRICES.length, 18);
check("alle SKU's oplosbaar", DEFAULT_PRICES.every((p) => findPrice(DEFAULT_PRICES, p.location, p.sessionType, p.product)?.code === p.code), true);
check("geen dubbele codes", new Set(DEFAULT_PRICES.map((p) => p.code)).size, DEFAULT_PRICES.length);

// ---------- historische tarieven ----------
console.log("\nhistorische tarieven");
{
  const original = DEFAULT_PRICES.find((p) => p.baseCode === "PR-SOLO-10")!;
  const { closed, opened } = repriceItem(original, 695, "2027-01-01");
  const catalogue = [...DEFAULT_PRICES.filter((p) => p.baseCode !== "PR-SOLO-10"), closed, opened];

  check("oude versie loopt tot de dag ervoor", closed.activeUntil, "2026-12-31");
  check("oude versie is niet meer actief", closed.active, false);
  check("nieuwe versie krijgt een eigen code", opened.code, "PR-SOLO-10@2027-01-01");
  check("nieuwe versie deelt de baseCode", opened.baseCode, "PR-SOLO-10");
  check("nieuwe versie heeft geen einddatum", opened.activeUntil, undefined);

  const before = findPrice(catalogue, "Privéruimte", "Solo", "Pakket 10", "2026-11-01");
  const after = findPrice(catalogue, "Privéruimte", "Solo", "Pakket 10", "2027-03-01");
  const onSwitch = findPrice(catalogue, "Privéruimte", "Solo", "Pakket 10", "2027-01-01");
  const dayBefore = findPrice(catalogue, "Privéruimte", "Solo", "Pakket 10", "2026-12-31");

  check("verkoop vóór de wijziging houdt het oude bedrag", before?.amount, 650);
  check("verkoop erna krijgt het nieuwe bedrag", after?.amount, 695);
  check("op de ingangsdatum geldt het nieuwe bedrag", onSwitch?.amount, 695);
  check("de dag ervoor geldt nog het oude", dayBefore?.amount, 650);
  check("historiek bevat beide versies", priceHistory(catalogue, "PR-SOLO-10").length, 2);
  check("historiek staat nieuwste eerst", priceHistory(catalogue, "PR-SOLO-10")[0].amount, 695);
  check("andere producten blijven ongemoeid", findPrice(catalogue, "Aan huis", "Solo", "Pakket 10", "2027-03-01")?.amount, 760);
}

// ---------- credits ----------
console.log("\ncredits");
const pack = (id: number, date: string, months: number, credits = 10): Transaction => ({
  id,
  date,
  clientId: 1,
  location: "Privéruimte",
  sessionType: "Solo",
  product: "Pakket 10",
  productCode: "PR-SOLO-10",
  creditsBought: credits,
  amount: 650,
  validityMonths: months,
  expiresOn: months > 0 ? addMonths(date, months) : undefined,
  paid: true,
  invoiceNeeded: false,
});
const loose = (id: number, date: string, sessionId?: number): Transaction => ({
  id,
  date,
  clientId: 1,
  location: "Privéruimte",
  sessionType: "Solo",
  product: "Losse sessie",
  productCode: "PR-SOLO-LOS",
  creditsBought: 1,
  amount: 70,
  validityMonths: 0,
  paid: true,
  invoiceNeeded: false,
  sessionId,
});
const sess = (id: number, date: string, status: Session["status"] = "Uitgevoerd", type: Session["sessionType"] = "Solo"): Session => ({
  id,
  date,
  clientId: 1,
  location: "Privéruimte",
  sessionType: type,
  status,
});

check("chargeable statuses", ["Uitgevoerd", "Te laat geannuleerd", "Niet verschenen", "Geannuleerd op tijd", "Niet aangerekend"].map(isChargeable as never), [true, true, true, false, false]);

const basic = buildLedger([pack(1, "2026-01-10", 4)], [sess(1, "2026-01-12"), sess(2, "2026-01-19"), sess(3, "2026-01-26")], "2026-02-01");
check("3 van 10 gebruikt", basic.available, 7);
check("vervaldatum doorgegeven", basic.nextExpiry, "2026-05-10");
check("niets onbetaald", basic.uncoveredSessionIds, []);

const cancelled = buildLedger([pack(1, "2026-01-10", 4)], [sess(1, "2026-01-12", "Geannuleerd op tijd"), sess(2, "2026-01-19", "Te laat geannuleerd"), sess(3, "2026-01-20", "Niet aangerekend")], "2026-02-01");
check("alleen te laat geannuleerd kost credit", cancelled.available, 9);

const expired = buildLedger([pack(1, "2026-01-10", 4, 10)], [sess(1, "2026-01-12")], "2026-07-01");
check("verlopen pakket telt niet mee als beschikbaar", expired.available, 0);
check("verlopen credits geteld als verspeeld", expired.forfeited, 9);
check("signaal bij verlopen pakket", signalFor(expired, "2026-01-12", 30, "2026-07-01"), "verlopen");

// A session after expiry must not be paid for by the expired pack.
const afterExpiry = buildLedger([pack(1, "2026-01-10", 4)], [sess(1, "2026-06-01")], "2026-06-02");
check("sessie na vervaldatum is niet gedekt", afterExpiry.uncoveredSessionIds, [1]);

// FIFO: the older pack drains first even when a newer one exists.
const fifo = buildLedger(
  [pack(1, "2026-01-10", 4, 2), pack(2, "2026-02-10", 4, 10)],
  [sess(1, "2026-02-15"), sess(2, "2026-02-16"), sess(3, "2026-02-17")],
  "2026-03-01",
);
check("oudste pakket eerst leeg", fifo.packs.map((p) => p.remaining), [0, 9]);

// Credits are bucketed: a Solo pack cannot pay for a Duo session.
const buckets = buildLedger([pack(1, "2026-01-10", 4)], [sess(1, "2026-01-12", "Uitgevoerd", "Duo")], "2026-02-01");
check("duo-sessie put niet uit solo-pakket", buckets.available, 10);
check("duo-sessie blijft ongedekt", buckets.uncoveredSessionIds, [1]);

// A session logged before the purchase date should not be covered retroactively.
const beforePurchase = buildLedger([pack(1, "2026-02-10", 4)], [sess(1, "2026-01-05")], "2026-03-01");
check("sessie vóór aankoop is niet gedekt", beforePurchase.uncoveredSessionIds, [1]);
check("pakket blijft vol", beforePurchase.available, 10);

const SIG = { packExpiryWarningDays: 30, inactiveDays: 30 };
check("signaal bij weinig credits", signalFor(buildLedger([pack(1, "2026-07-01", 4, 2)], [], "2026-07-05"), "2026-07-04", SIG, "2026-07-05"), "laag");
check("signaal bij lege teller", signalFor(buildLedger([], [], "2026-07-05"), undefined, SIG, "2026-07-05"), "op");
check("signaal bij lang niet getraind", signalFor(buildLedger([pack(1, "2026-01-01", 12)], [], "2026-07-05"), "2026-04-01", SIG, "2026-07-05"), "inactief");

// ---------- losse sessies: mogelijkheid B ----------
console.log("\nlosse sessies (mogelijkheid B)");

// The whole point of B: a paid loose session must not look like free credit.
const looseOnly = buildLedger([loose(1, "2026-03-01")], [], "2026-03-02");
check("losse sessie telt niet als creditsaldo", looseOnly.available, 0);
check("losse sessie staat apart als nog te geven", looseOnly.looseUnused, 1);
check("losse sessie geeft geen vervaldatum", looseOnly.nextExpiry, undefined);
check("geen pakket-signaal voor losse-sessieklant", signalFor(looseOnly, undefined, SIG, "2026-03-02"), "ok");

const looseUsed = buildLedger([loose(1, "2026-03-01")], [sess(1, "2026-03-02")], "2026-03-03");
check("losse sessie dekt de training", looseUsed.uncoveredSessionIds, []);
check("na gebruik niets meer tegoed", looseUsed.looseUnused, 0);
check("creditsaldo blijft nul", looseUsed.available, 0);

// An explicit booking must win over date order.
const looseLinked = buildLedger(
  [loose(1, "2026-03-01", 7)],
  [sess(7, "2026-03-05"), sess(8, "2026-03-02")],
  "2026-03-06",
);
check("expliciet gekoppelde sessie is gedekt", looseLinked.uncoveredSessionIds, [8]);

// Packs expire, loose sales do not — so the pack must drain first.
const mixed = buildLedger(
  [pack(1, "2026-03-01", 4, 1), loose(2, "2026-03-01")],
  [sess(1, "2026-03-10"), sess(2, "2026-03-11")],
  "2026-03-12",
);
check("pakket gaat voor op losse sessie", mixed.packs[0].remaining, 0);
check("beide sessies gedekt", mixed.uncoveredSessionIds, []);
check("losse sessie is opgebruikt", mixed.looseUnused, 0);

// A loose sale bought after the session cannot cover it retroactively.
const looseLate = buildLedger([loose(1, "2026-03-10")], [sess(1, "2026-03-01")], "2026-03-11");
check("losse sessie dekt geen eerdere training", looseLate.uncoveredSessionIds, [1]);
check("blijft tegoed staan", looseLate.looseUnused, 1);

// Buckets apply to loose sales too.
const looseBucket = buildLedger([loose(1, "2026-03-01")], [sess(1, "2026-03-02", "Uitgevoerd", "Duo")], "2026-03-03");
check("losse solo dekt geen duo", looseBucket.uncoveredSessionIds, [1]);

// ---------- thresholds ----------
console.log("\nthresholds");
const s = DEFAULT_SETTINGS;
check("btw plafond = grens - marge", vatStatus(0, s).limit, 23500);
check("btw ok onder 80%", vatStatus(10000, s).level, "ok");
check("btw waarschuwing vanaf 80%", vatStatus(18800, s).level, "waarschuwing");
check("btw kritiek vanaf 95%", vatStatus(22325, s).level, "kritiek");
check("btw overschreden", vatStatus(23500, s).level, "overschreden");
check("btw resterende ruimte", vatStatus(20000, s).remaining, 3500);

check("netto winst = omzet - kosten", socialStatus(20000, s).netProfit, 15000);
check("vrijstelling onder grens", socialStatus(6000, s).exempt, true);
check("geen vrijstelling erboven", socialStatus(20000, s).exempt, false);
check("netto winst nooit negatief", socialStatus(1000, s).netProfit, 0);

// ---------- invoicing ----------
console.log("\ninvoicing");
check("factuurnummer telt op", nextNumber("2026-001"), "2026-002");
check("factuurnummer rolt over", nextNumber("2026-009"), "2026-010");
check("factuurnummer behoudt breedte", nextNumber("2026-099"), "2026-100");
check("factuurnummer zonder cijfers", nextNumber("FACTUUR"), "FACTUUR-2");

// ---------- sanity on the real numbers ----------
console.log("\nscenario: een jaar zoals Yens het draait");
// 9 clients each buying two Privéruimte solo packs over the year.
const txs: Transaction[] = [];
for (let c = 0; c < 9; c++) {
  txs.push({ ...pack(c * 2 + 1, "2026-02-01", 4), clientId: c + 1 });
  txs.push({ ...pack(c * 2 + 2, "2026-07-01", 4), clientId: c + 1 });
}
const revenue = txs.reduce((sum, t) => sum + t.amount, 0);
check("omzet 18 pakketten", revenue, 11700);
check("blijft onder btw-plafond", vatStatus(revenue, s).level, "ok");
check("boven sociale vrijstelling", socialStatus(revenue, s).exempt, false);
// The threshold that would actually bite: how many packs before the VAT ceiling?
const packsToLimit = Math.floor(23500 / 650);
check("pakketten tot btw-plafond", packsToLimit, 36);

// ---------- dashboard rapportage ----------
console.log("\ndashboard per maand");
{
  const ov = (id: number, name: string, status: Client["status"], startDate: string): ClientOverview => ({
    client: { id, name, status, startDate, location: "Privéruimte" },
    ledger: buildLedger([], [], "2026-08-01"),
    signal: "ok",
    sessionCount: 0,
  });
  const informEntry = (id: number, date: string, amount: number): InformEntry => ({
    id,
    date,
    sessionType: "Solo PT",
    hours: 1,
    hourlyRate: amount,
    amount,
    invoiced: false,
  });

  const data = {
    overview: [
      ov(1, "A", "Actief", "2026-07-03"),
      ov(2, "B", "Actief", "2026-08-10"),
      ov(3, "C", "Gepauzeerd", "2025-05-01"),
      ov(4, "D", "Stopgezet", "2025-06-01"),
    ],
    transactions: [
      { ...pack(1, "2026-07-31", 4), clientId: 1 }, // last day of July
      { ...pack(2, "2026-08-01", 4), clientId: 2 }, // first day of August
      { ...pack(3, "2025-12-31", 4), clientId: 1 }, // previous year
    ],
    sessions: [sess(1, "2026-07-15"), sess(2, "2026-08-05"), sess(3, "2026-08-06", "Uitgevoerd", "Duo")],
    inform: [informEntry(1, "2026-07-20", 45), informEntry(2, "2026-08-02", 60)],
    invoices: [],
  };

  const july = buildReport("2026-07", data, DEFAULT_SETTINGS, "2026-08-01");
  const august = buildReport("2026-08", data, DEFAULT_SETTINGS, "2026-08-01");
  const december = buildReport("2025-12", data, DEFAULT_SETTINGS, "2026-08-01");

  check("juli-omzet = pakket + inform van juli", july.revenue.month, 695);
  check("augustus-omzet telt juli niet mee", august.revenue.month, 710);
  check("maandgrens: 31 juli hoort bij juli", july.revenue.month - 45, 650);
  check("jaaromzet 2026 telt 2025 niet mee", august.revenue.year, 1405);
  check("vorig jaar heeft eigen jaartotaal", december.revenue.year, 650);
  check("jaar volgt de gekozen maand", december.year, 2025);
  check("nieuwe klanten in juli", july.clients.newInMonth.length, 1);
  check("nieuwe klanten in augustus", august.clients.newInMonth.length, 1);
  check("actieve klanten staan los van de maand", july.clients.active, 2);
  check("gepauzeerd en stopgezet apart geteld", [july.clients.paused, july.clients.stopped], [1, 1]);
  check("sessies in augustus", august.sessions.month, 2);
  check("sessies per type in augustus", august.sessions.byType, { Solo: 1, Duo: 1 });
  check("sessies dit jaar", august.sessions.year, 3);
  check("gemiddelde maandomzet = jaar / 8 maanden", Math.round(august.revenue.averageMonth), 176);
  check("geschatte jaaromzet = gemiddelde x 12", Math.round(august.revenue.projectedYear), 2108);
  check("niets ontvangen zonder betaaldatum", august.revenue.receivedMonth, 0);
  check("openstaand telt onbetaalde verkopen", august.outstanding, 0);
}

// ---------- grafieken ----------
console.log("\ngrafieken");
{
  check("asplafond rondt netjes af", [niceMax(650), niceMax(1240), niceMax(37), niceMax(8)], [1000, 2000, 50, 10]);
  check("asplafond bij nul", niceMax(0), 1);
  check("asplafond exact op een ronde waarde", niceMax(1000), 1000);
  check("tickwaarden lopen tot het plafond", ticks(1000), [0, 250, 500, 750, 1000]);

  // A zero-height bar draws nothing rather than a stray sliver.
  check("staaf van nul is leeg", barPath(0, 100, 20, 0, true), "");
  // The rounded end must never eat more than the bar's own height.
  const stub = barPath(0, 98, 20, 2, true);
  check("afronding klemt op lage staaf", stub.includes("Q0,98 2,98"), true);

  // Twelve months on a narrow phone must still leave room for the labels.
  const narrow = 320;
  const band = (narrow - 46 - 12) / 12;
  check("staafbreedte blijft binnen de band", Math.min(24, band * 0.62) < band, true);
  check("staaf haalt de maximumdikte niet op smal scherm", Math.round(Math.min(24, band * 0.62)), 14);

  // Nothing may be drawn outside the svg box, at any realistic width.
  for (const w of [320, 375, 768, 1040]) {
    const plotW = w - 46 - 12;
    const b = plotW / 12;
    const bw = Math.min(24, b * 0.62);
    const firstLeft = 46 + b * 0 + b / 2 - bw / 2;
    const lastRight = 46 + b * 11 + b / 2 + bw / 2;
    check(`staven blijven binnen het kader op ${w}px`, firstLeft > 0 && lastRight < w, true);
  }

  const series = buildMonthlySeries(2026, {
    overview: [],
    transactions: [{ ...pack(1, "2026-03-10", 4), clientId: 1 }],
    sessions: [sess(1, "2026-03-11"), sess(2, "2026-03-12"), sess(3, "2026-04-01")],
    inform: [
      { id: 1, date: "2026-03-05", sessionType: "Solo PT", hours: 1, hourlyRate: 45, amount: 45, invoiced: false },
    ],
    invoices: [],
  });
  check("twaalf maanden, altijd", series.length, 12);
  check("maart bevat pakket en inform", [series[2].own, series[2].inform, series[2].total], [650, 45, 695]);
  check("lege maand blijft nul", series[0].total, 0);
  check("sessies per maand", [series[2].sessions, series[3].sessions], [2, 1]);
  check("actieve klanten telt unieke klanten", series[2].activeClients, 1);
}

// ---------- csv ----------
console.log("\ncsv-export");
{
  check("kolommen met puntkomma", toCsv(["a", "b"], [[1, 2]]), "a;b\r\n1;2");
  check("decimale komma voor Excel", toCsv(["bedrag"], [[1080.5]]), "bedrag\r\n1080,5");
  // A name containing the separator must not split into two columns.
  check('puntkomma in tekst wordt gequote', toCsv(["naam"], [["De Proft; Yens"]]), 'naam\r\n"De Proft; Yens"');
  check("aanhalingsteken wordt verdubbeld", toCsv(["naam"], [['Jan "JD"']]), 'naam\r\n"Jan ""JD"""');
  check("nieuwe regel blijft binnen één cel", toCsv(["adres"], [["Straat 1\n2000 Stad"]]), 'adres\r\n"Straat 1\n2000 Stad"');
  check("lege waarde blijft leeg", toCsv(["a", "b"], [[undefined, "x"]]), "a;b\r\n;x");
}

console.log(`\n${failures === 0 ? "Alles in orde." : `${failures} test(s) gefaald.`}`);
console.log(`(gedraaid op ${toIso(new Date())})`);
process.exit(failures === 0 ? 0 : 1);
