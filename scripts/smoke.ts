// Smoke test for the money-relevant logic. Run with: npm test
import { buildLedger, isChargeable, signalFor } from "../src/domain/credits";
import {
  addMonths,
  daysBetween,
  daysUntilBirthday,
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
import { buildIcs, upcoming } from "../src/domain/ics";
import { invoiceMail, needsReminder, reminderMail } from "../src/domain/mail";
import { toWhatsAppNumber, whatsAppLink } from "../src/domain/whatsapp";
import { blockLabel, gridRange, layout, minutesOf, timeOf, toBlocks } from "../src/domain/agenda";

import { hashCode, makeSalt, sameHash, verifyCode } from "../src/domain/lock";
import { APPOINTMENTS, CLIENTS, PRICES, SESSIONS, SPECS, TRANSACTIONS } from "../src/sync/rows";
import { DEFAULT_PRICES, DEFAULT_SETTINGS } from "../src/db/seed";
import type { Appointment, Client, InformEntry, Session, Transaction } from "../src/db/schema";
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

// ---------- toegangscode ----------
console.log("\ntoegangscode");
{
  const salt = makeSalt();
  check("zout is 32 hextekens", /^[0-9a-f]{32}$/.test(salt), true);
  check("twee zouten verschillen", makeSalt() === makeSalt(), false);

  const hash = await hashCode("1234", salt);
  check("hash is 64 hextekens", /^[0-9a-f]{64}$/.test(hash), true);
  check("de code staat niet in de hash", hash.includes("1234"), false);
  check("juiste code opent", await verifyCode("1234", salt, hash), true);
  check("verkeerde code opent niet", await verifyCode("1235", salt, hash), false);
  check("lege code opent niet", await verifyCode("", salt, hash), false);

  // Same code, different salt must not produce the same hash.
  check("ander zout geeft andere hash", (await hashCode("1234", makeSalt())) === hash, false);
  check("vergelijking op lengte", sameHash("abc", "abcd"), false);
}

// ---------- synchronisatie ----------
console.log("\nsynchronisatie");
{
  const COACH = "00000000-0000-0000-0000-000000000009";
  // Local id 1 became remote id 77; local session 5 became remote 88.
  const resolve = (t: string, id: number) =>
    t === "clients" && id === 1 ? 77 : t === "sessions" && id === 5 ? 88 : undefined;
  const unresolve = (t: string, id: string | number) =>
    t === "clients" && id === 77 ? 1 : t === "sessions" && id === 88 ? 5 : undefined;

  const client: Client = {
    id: 1,
    name: "Test Persoon",
    status: "Actief",
    startDate: "2026-02-09",
    location: "Aan huis",
    email: "x@example.com",
  };
  const row = CLIENTS.toRow(client, COACH, resolve)!;
  check("klant krijgt de coach mee", row.coach_id, COACH);
  check("camelCase wordt snake_case", [row.start_date, row.billing_name], ["2026-02-09", null]);
  check("heen en terug behoudt de naam", CLIENTS.fromRow(row, unresolve)!.name, "Test Persoon");
  check("heen en terug behoudt de locatie", CLIENTS.fromRow(row, unresolve)!.location, "Aan huis");

  // Foreign keys must be rewritten, not copied.
  const tx: Transaction = { ...pack(9, "2026-07-28", 4), clientId: 1, sessionId: 5 };
  const txRow = TRANSACTIONS.toRow(tx, COACH, resolve)!;
  check("klantverwijzing wordt vertaald", txRow.client_id, 77);
  check("sessieverwijzing wordt vertaald", txRow.session_id, 88);
  check("lokale id gaat niet mee", txRow.id, undefined);
  const back = TRANSACTIONS.fromRow(txRow, unresolve)!;
  check("terugvertaald naar lokale klant", back.clientId, 1);
  check("terugvertaald naar lokale sessie", back.sessionId, 5);
  check("bedrag blijft gelijk", back.amount, tx.amount);

  // A record whose client has not been pushed yet must be skipped, not sent
  // with a dangling reference.
  const orphan: Transaction = { ...pack(10, "2026-07-28", 4), clientId: 999 };
  check("wees zonder klant wordt overgeslagen", TRANSACTIONS.toRow(orphan, COACH, resolve), null);
  check("wees bij ophalen wordt overgeslagen",
    TRANSACTIONS.fromRow({ ...txRow, client_id: 12345 }, unresolve), null);

  // Postgres hands back numerics as strings and dates as timestamps.
  const numeric = TRANSACTIONS.fromRow({ ...txRow, amount: "650.00", date: "2026-07-28T00:00:00+00:00" }, unresolve)!;
  check("numeriek uit Postgres wordt een getal", numeric.amount, 650);
  check("datum wordt afgekapt tot de dag", numeric.date, "2026-07-28");

  const sess1: Session = { id: 3, date: "2026-03-01", clientId: 1, location: "Privéruimte", sessionType: "Duo", status: "Uitgevoerd", groupId: "G0041" };
  const sRow = SESSIONS.toRow(sess1, COACH, resolve)!;
  check("groepsnummer gaat mee", sRow.group_id, "G0041");
  check("sessie zonder groep wordt null",
    SESSIONS.toRow({ ...sess1, groupId: undefined }, COACH, resolve)!.group_id, null);

  check("prijs houdt zijn eigen sleutel", PRICES.toRow(DEFAULT_PRICES[0], COACH, resolve)!.code, "PR-SOLO-LOS");
  check("prijs heen en terug", PRICES.fromRow(PRICES.toRow(DEFAULT_PRICES[1], COACH, resolve)!, unresolve)!.amount, 650);

  const appt = {
    id: 4, date: "2026-08-10", startTime: "09:30", durationMinutes: 60, clientId: 1,
    location: "Privéruimte" as const, sessionType: "Duo" as const,
    status: "Gepland" as const, groupId: "G0042", sessionId: 5,
  };
  const aRow = APPOINTMENTS.toRow(appt, COACH, resolve)!;
  check("afspraak vertaalt de klant", aRow.client_id, 77);
  check("afspraak vertaalt de sessie", aRow.session_id, 88);
  check("startuur gaat mee", aRow.start_time, "09:30");
  // Postgres returns time as "09:30:00"; the time input needs "09:30".
  check("uur uit Postgres wordt afgekapt",
    APPOINTMENTS.fromRow({ ...aRow, start_time: "09:30:00" }, unresolve)!.startTime, "09:30");
  check("afspraak zonder klant wordt overgeslagen",
    APPOINTMENTS.toRow({ ...appt, clientId: 999 }, COACH, resolve), null);

  // Push order: nothing may be sent before what it points at.
  const order = SPECS.map((s) => s.local);
  for (const spec of SPECS) {
    for (const dep of spec.dependsOn) {
      check(`${spec.local} komt na ${dep}`, order.indexOf(dep) < order.indexOf(spec.local), true);
    }
  }
}

// ---------- agendabestanden ----------
console.log("\nagenda (.ics)");
{
  const settings = { ...DEFAULT_SETTINGS, tradeName: "YENS", email: "coach@example.com", address: "Straat 1, 2627 Schelle" };
  const appointment = {
    id: 12, date: "2026-08-10", startTime: "09:30", durationMinutes: 60, clientId: 1,
    location: "Privéruimte" as const, sessionType: "Solo" as const, status: "Gepland" as const,
  };
  const ics = buildIcs([{ appointment, clientName: "Anna Jansen" }], settings);
  const lines = ics.split("\r\n");

  check("begint en eindigt correct", [lines[0], lines.at(-2)], ["BEGIN:VCALENDAR", "END:VCALENDAR"]);
  check("regels eindigen op CRLF", ics.includes("\r\n"), true);
  check("starttijd in lokale tijd zonder Z", lines.includes("DTSTART:20260810T093000"), true);
  check("eindtijd is start plus duur", lines.includes("DTEND:20260810T103000"), true);
  check("uid is stabiel per afspraak", lines.includes("UID:appointment-12@ptadmin"), true);
  check("herinnering twee uur vooraf", lines.includes("TRIGGER:-PT2H"), true);

  // An hour that crosses midnight must roll the date too.
  const late = buildIcs([{ appointment: { ...appointment, startTime: "23:30" }, clientName: "A" }], settings);
  check("over middernacht rolt de datum mee", late.includes("DTEND:20260811T003000"), true);

  // Commas and semicolons carry meaning in the format and must be escaped.
  const tricky = buildIcs([{ appointment: { ...appointment, note: "Let op; knie, links" }, clientName: "A" }], settings);
  check("puntkomma wordt geëscapet", tricky.includes("Let op\\; knie\\, links"), true);
  check("nieuwe regel wordt \\n", buildIcs([{ appointment: { ...appointment, note: "een\ntwee" }, clientName: "A" }], settings).includes("een\\ntwee"), true);

  // No line may exceed 75 octets, or strict parsers reject the file.
  const longNote = buildIcs([{ appointment: { ...appointment, note: "x".repeat(300) }, clientName: "A" }], settings);
  check("lange regels worden gevouwen", longNote.split("\r\n").every((l) => l.length <= 75), true);

  const invite = buildIcs(
    [{ appointment, clientName: "Anna Jansen", clientEmail: "anna@example.com" }],
    settings, "REQUEST",
  );
  check("uitnodiging gebruikt METHOD:REQUEST", invite.includes("METHOD:REQUEST"), true);
  check("uitnodiging bevat de genodigde", invite.includes("mailto:anna@example.com"), true);
  check("publicatie bevat geen genodigde", ics.includes("ATTENDEE"), false);
  check("afgezegde afspraak is CANCELLED",
    buildIcs([{ appointment: { ...appointment, status: "Afgezegd" }, clientName: "A" }], settings).includes("STATUS:CANCELLED"), true);

  check("enkel toekomstige, niet-afgevinkte afspraken",
    upcoming([
      appointment,
      { ...appointment, id: 2, date: "2026-01-01" },
      { ...appointment, id: 3, sessionId: 5 },
      { ...appointment, id: 4, status: "Afgezegd" as const },
    ], "2026-08-01").map((a) => a.id), [12]);
}

// ---------- facturen versturen ----------
console.log("\nfacturen versturen");
{
  const s = { ...DEFAULT_SETTINGS, businessName: "Y De P", iban: "BE00 0000 0000 0000" };
  const inv = {
    id: 1, number: "2026-004", date: "2026-06-01", dueDate: "2026-06-15",
    type: "Eigen klant" as const, recipientName: "Anna Jansen",
    recipientEmail: "anna@example.com", lines: [], vatAmount: 0, amount: 650,
    status: "Verzonden" as const, sourceType: "transaction" as const, sourceIds: [],
  };

  const mail = invoiceMail(inv, s);
  check("factuurmail gaat naar de klant", mail.to, "anna@example.com");
  check("onderwerp bevat het nummer", mail.subject, "Factuur 2026-004");
  check("mailtoLink is opgebouwd", mail.href.startsWith("mailto:anna%40example.com?subject="), true);
  check("bedrag staat in de tekst", mail.body.includes("650"), true);
  check("mededeling staat in de tekst", mail.body.includes('"2026-004"'), true);

  const first = reminderMail(inv, s, "2026-07-01");
  check("eerste herinnering telt de dagen", first.body.includes("16 dagen geleden"), true);
  check("eerste herinnering in het onderwerp", first.subject, "Herinnering factuur 2026-004");

  const again = reminderMail({ ...inv, reminderSentOn: "2026-07-01" }, s, "2026-07-20");
  check("tweede herinnering wordt herkend", again.subject.startsWith("Tweede herinnering"), true);
  check("tweede herinnering verwijst naar de eerste", again.body.includes("1 juli 2026"), true);

  const list = [
    inv,
    { ...inv, id: 2, status: "Betaald" as const },
    { ...inv, id: 3, status: "Concept" as const },
    { ...inv, id: 4, status: "Geannuleerd" as const },
    { ...inv, id: 5, dueDate: "2027-01-01" },
  ];
  check("enkel te late, openstaande facturen", needsReminder(list, "2026-07-01").map((i) => i.id), [1]);
}

// ---------- whatsapp ----------
console.log("\nwhatsapp");
{
  // wa.me wants international digits only: no plus, no spaces, no leading zero.
  check("internationaal met spaties", toWhatsAppNumber("+32 470 12 34 56"), "32470123456");
  check("nationaal krijgt landcode", toWhatsAppNumber("0470 12 34 56"), "32470123456");
  check("00-prefix wordt landcode", toWhatsAppNumber("0032470123456"), "32470123456");
  check("nederlands nummer blijft nederlands", toWhatsAppNumber("+31 620 74 73 27"), "31620747327");
  // The bracketed zero is a national trunk prefix and must not survive next to
  // a country code — "320470…" would be a dead link.
  check("streepjes en haakjes eruit", toWhatsAppNumber("+32 (0)470-12.34.56"), "32470123456");
  check("haakjesnul verdwijnt ook na 0032", toWhatsAppNumber("0032 (0)470 12 34 56"), "32470123456");
  check("leeg geeft niets", toWhatsAppNumber(undefined), null);
  check("onzin geeft niets", toWhatsAppNumber("geen nummer"), null);
  check("te kort geeft niets", toWhatsAppNumber("+32 12"), null);
  check("te lang geeft niets", toWhatsAppNumber("+3212345678901234567"), null);

  const link = whatsAppLink("+32 470 12 34 56", "Dag Anna, YENS hier.");
  check("link is een wa.me-adres", link?.startsWith("https://wa.me/32470123456?text="), true);
  check("bericht is url-veilig", link?.includes("Dag%20Anna"), true);
  check("geen nummer geeft geen link", whatsAppLink(""), null);
}

// ---------- agenda ----------
console.log("\nagenda");
{
  const appt = (
    id: number,
    date: string,
    startTime: string,
    durationMinutes = 60,
    extra: Partial<Appointment> = {},
  ): Appointment => ({
    id,
    date,
    startTime,
    durationMinutes,
    clientId: id,
    location: "Privéruimte",
    sessionType: "Solo",
    status: "Gepland",
    ...extra,
  });

  check("uren naar minuten", [minutesOf("00:00"), minutesOf("09:30"), minutesOf("23:59")], [0, 570, 1439]);
  check("minuten terug naar uren", [timeOf(0), timeOf(570), timeOf(1439)], ["00:00", "09:30", "23:59"]);

  // A duo is two rows sharing a groupId; drawn naively they cover each other.
  const duo = toBlocks([
    appt(1, "2026-08-10", "09:00", 60, { groupId: "G0001" }),
    appt(2, "2026-08-10", "09:00", 60, { groupId: "G0001" }),
  ]);
  check("duo wordt één blok", duo.length, 1);
  check("beide deelnemers zitten erin", duo[0].appointments.length, 2);
  check("blok loopt van 9 tot 10", [duo[0].start, duo[0].end], [540, 600]);

  // Same group id on a different day is a different training.
  check(
    "zelfde groep op een andere dag blijft apart",
    toBlocks([
      appt(1, "2026-08-10", "09:00", 60, { groupId: "G0001" }),
      appt(2, "2026-08-11", "09:00", 60, { groupId: "G0001" }),
    ]).length,
    2,
  );

  check(
    "afgevinkt pas als iedereen afgevinkt is",
    toBlocks([
      appt(1, "2026-08-10", "09:00", 60, { groupId: "G0002", sessionId: 5 }),
      appt(2, "2026-08-10", "09:00", 60, { groupId: "G0002" }),
    ])[0].done,
    false,
  );

  // Two unrelated clients at the same hour must sit side by side.
  const clash = layout(toBlocks([appt(1, "2026-08-10", "09:00"), appt(2, "2026-08-10", "09:00")]));
  check("overlap krijgt twee kolommen", clash.map((b) => b.columns), [2, 2]);
  check("elk een eigen kolomindex", clash.map((b) => b.column).sort(), [0, 1]);

  // Back to back is not an overlap.
  const chain = layout(toBlocks([appt(1, "2026-08-10", "09:00"), appt(2, "2026-08-10", "10:00")]));
  check("aansluitend is geen overlap", chain.map((b) => b.columns), [1, 1]);

  // Partial overlap still shares the width.
  const partial = layout(toBlocks([appt(1, "2026-08-10", "09:00", 90), appt(2, "2026-08-10", "10:00")]));
  check("gedeeltelijke overlap deelt de breedte", partial.map((b) => b.columns), [2, 2]);

  // A third at the same time takes a third of the width.
  const three = layout(
    toBlocks([appt(1, "2026-08-10", "09:00"), appt(2, "2026-08-10", "09:00"), appt(3, "2026-08-10", "09:00")]),
  );
  check("drie tegelijk geeft drie kolommen", three[0].columns, 3);

  // Different days never collide.
  const days = layout(toBlocks([appt(1, "2026-08-10", "09:00"), appt(2, "2026-08-11", "09:00")]));
  check("andere dag botst niet", days.map((b) => b.columns), [1, 1]);

  check("standaard werkdag", gridRange([]), [7, 21]);
  check("vroege afspraak verbreedt het raster",
    gridRange(toBlocks([appt(1, "2026-08-10", "06:30")]))[0], 6);
  check("late afspraak verbreedt het raster",
    gridRange(toBlocks([appt(1, "2026-08-10", "21:30", 60)]))[1], 23);

  const nameOf = (id: number) => ["", "Anna Jansen", "Bram Peeters", "Cis De Wit"][id] ?? "";
  check("solo toont de naam", blockLabel(duo[0], () => "Anna Jansen"), "Anna Jansen + Anna Jansen");
  check("groep van drie kort samengevat",
    blockLabel(
      toBlocks([
        appt(1, "2026-08-10", "09:00", 60, { groupId: "G3" }),
        appt(2, "2026-08-10", "09:00", 60, { groupId: "G3" }),
        appt(3, "2026-08-10", "09:00", 60, { groupId: "G3" }),
      ])[0],
      nameOf,
    ),
    "Anna Jansen +2",
  );
}

// ---------- verjaardagen ----------
console.log("\nverjaardagen");
{
  check("jarig vandaag", daysUntilBirthday("1990-08-03", "2026-08-03"), 0);
  check("jarig over vier dagen", daysUntilBirthday("1990-08-07", "2026-08-03"), 4);
  // Al geweest dit jaar: dan telt de volgende, niet een negatief getal.
  check("al geweest telt naar volgend jaar", daysUntilBirthday("1990-08-01", "2026-08-03"), 363);
  // Over de jaargrens heen blijft het een klein getal.
  check("over de jaarwissel", daysUntilBirthday("1990-01-02", "2026-12-30"), 3);
  check("29 februari in een gewoon jaar", daysUntilBirthday("1992-02-29", "2026-02-01") !== null, true);
  check("geen geboortedatum", daysUntilBirthday("", "2026-08-03"), null);
}

console.log(`\n${failures === 0 ? "Alles in orde." : `${failures} test(s) gefaald.`}`);
console.log(`(gedraaid op ${toIso(new Date())})`);
process.exit(failures === 0 ? 0 : 1);
