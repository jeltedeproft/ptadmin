# PT Admin

Klanten-, sessie- en facturatiebeheer voor een zelfstandige personal trainer.
Eerste versie, gebouwd op basis van `Business Dossier.xlsx`.

Installeerbare PWA: draait in de browser, maar is ook te installeren als app op
Windows (Chrome/Edge → installatie-icoon in de adresbalk) en op gsm
(deelmenu → "Zet op beginscherm"). Werkt daarna offline.

## Draaien

```bash
npm install
npm run dev       # dev server
npm run build     # productiebuild naar dist/
npm run preview   # dist/ lokaal serveren
npm test          # smoke tests op de domeinlogica
```

## Gegevens

Alles staat lokaal in IndexedDB op het toestel zelf. Er is geen server en geen
account. Gevolg: **de gegevens van de gsm en de pc zijn gescheiden** — het is
één toestel per dataset tot er sync bij komt.

Back-up en herstel via **Meer → Back-up** (JSON-bestand).

`data/import-uit-excel.json` bevat de 9 klanten, de bedrijfsgegevens en de ene
verkoop die al in het Excel-bestand stonden. Laad dat één keer in via
**Meer → Importeer back-up**. Die map staat in `.gitignore`: er zitten
contactgegevens van echte klanten en een rekeningnummer in, en die horen niet
in een publieke repo. Het bestand is eenmalig uit het Excel gegenereerd —
aanpassen doe je rechtstreeks in de JSON.

## Online zetten

De app is een statische site — er is geen server nodig, want alle gegevens
blijven op het toestel. Hosting hoeft dus niets te kosten.

Staat live op **https://jeltedeproft.github.io/ptadmin/**

Elke push naar `main` bouwt en publiceert vanzelf via
`.github/workflows/deploy.yml`. De workflow draait eerst `npm test`, dus een
gebroken domeinlogica komt niet online. Verder is er niets te doen.

Let op: gratis GitHub Pages werkt alleen vanuit een **publieke** repo. Daarom
staan er geen bedrijfs- of klantgegevens in de broncode — zie hieronder.

**Netlify of Cloudflare Pages** — `netlify.toml` bevat de buildconfiguratie.
Beide kunnen ook vanuit een **private** repo publiceren, en serveren op een
domeinwortel wat iets properder is voor een PWA.

De basis-URL wordt via de omgevingsvariabele `BASE_PATH` gezet: leeg (`/`) voor
Netlify en Cloudflare, `/<repo>/` voor GitHub Pages. De workflow doet dat zelf.

### Wat er niet in de repo hoort

`src/db/seed.ts` bevat bewust **geen** bedrijfsgegevens: geen naam, adres,
ondernemingsnummer, IBAN of e-mail. Die staan in `data/import-uit-excel.json`,
en die map is gitignored. Zo blijft de repo veilig om publiek te zetten.

Bij een verse installatie zijn de bedrijfsgegevens dus leeg — het dashboard
toont een melding tot ze ingevuld zijn, via Instellingen of via de import.

## Structuur

```
src/
  db/
    schema.ts     domeinmodel — enums staan in het Nederlands, zoals in het Excel
    db.ts         Dexie/IndexedDB
    seed.ts       prijstabel + instellingen uit het Excel
  domain/
    pricing.ts    productcode afleiden + prijs opzoeken
    credits.ts    creditsaldo, vervaldata, signalen  ← de kern
    thresholds.ts btw- en sociale-bijdragegrenzen
    invoicing.ts  factuurnummering + pdf
    backup.ts     export/import
    dates.ts      datum- en bedragformattering (nl-BE)
  pages/          één bestand per scherm
```

## Hoe de credits werken

Een pakket zet geld om in credits met een vervaldatum (4 maanden privéruimte,
6 maanden aan huis). Een sessie verbruikt er één.

- Credits zijn **niet uitwisselbaar**: een pakket Privéruimte/Solo betaalt geen
  Aan huis/Duo-sessie. Elk pakket zit in zijn eigen mandje.
- Binnen een mandje gaat het **oudste pakket eerst** leeg (FIFO).
- Een pakket dat al vervallen was op de datum van de sessie telt niet mee. Zo'n
  sessie blijft staan als "niet gedekt" in plaats van stilletjes te verdwijnen.

Welke sessiestatussen een credit kosten staat in `CHARGEABLE_STATUSES`
(`src/domain/credits.ts`): *Uitgevoerd*, *Te laat geannuleerd* en
*Niet verschenen* kosten een credit; *Geannuleerd op tijd* en
*Niet aangerekend* niet. Bevestigd door Yens.

### Losse sessies — mogelijkheid B

Een losse sessie hoort bij **één specifieke training** en verschijnt niet als
vrij creditsaldo. Ze wordt automatisch aan een sessie gekoppeld zodra die
gelogd wordt (`Transaction.sessionId`), en tot dan staat ze als "nog te geven".

Gevolg voor de dekkingsvolgorde per sessie:

1. de losse sessie die expliciet aan deze training gekoppeld is;
2. anders het oudste nog geldige pakket in hetzelfde mandje;
3. anders een losse sessie die nog nergens aan hangt.

Pakketten gaan vóór losse sessies omdat pakketten vervallen en losse sessies
niet. Een klant die enkel losse sessies koopt, staat dus altijd op nul credits
— dat is geen waarschuwing, en het signaal toont "werkt per losse sessie".

## Facturen

De pdf volgt de huisstijl van de voorbeeldfactuur (lokaal in `docs/`, niet in
de repo — er staan reken- en klantgegevens op): woordmerk of geüpload logo, een blok
**Gefactureerd aan** met naam en adres van de klant, een tabel met
omschrijving / aantal / tarief / bedrag, subtotaal, btw (nvt.) en totaal, de
art. 56bis-vermelding, en onderaan contact- en betaalgegevens.

De klantnaam staat verplicht op elke factuur. Wanneer er aan een vennootschap
gefactureerd wordt, vult `billingName` op de klant de naam in die op de factuur
komt, in plaats van de persoonsnaam.

INFORM-facturen groeperen per trainingstype — "Solo PT · 12 × €45" — en
vermelden bewust geen klantnamen; die blijven intern.

## Nog niet gedaan

- Sync tussen toestellen (bewust: v1 is lokaal, zie hierboven)
- Facturen automatisch mailen
- Agenda/planning van toekomstige sessies — het Excel had dit ook niet
- Het CRM-tabblad was leeg in het Excel, dus er is niets om over te nemen
