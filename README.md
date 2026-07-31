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

**GitHub Pages** — `.github/workflows/deploy.yml` bouwt en publiceert bij elke
push naar `main`. Eenmalig instellen: repo → Settings → Pages → Source =
GitHub Actions. De site komt op `https://<gebruiker>.github.io/<repo>/`.
Let op: gratis GitHub Pages werkt alleen vanuit een **publieke** repo.

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

Een verkoop zet geld om in credits met een vervaldatum (4 maanden privéruimte,
6 maanden aan huis). Een sessie verbruikt er één.

- Credits zijn **niet uitwisselbaar**: een pakket Privéruimte/Solo betaalt geen
  Aan huis/Duo-sessie. Elk pakket zit in zijn eigen mandje.
- Binnen een mandje gaat het **oudste pakket eerst** leeg.
- Een pakket dat al vervallen was op de datum van de sessie telt niet mee. Zo'n
  sessie blijft staan als "niet gedekt" in plaats van stilletjes te verdwijnen.

Welke sessiestatussen een credit kosten staat in `CHARGEABLE_STATUSES`
(`src/domain/credits.ts`). Nu ingesteld op: *Uitgevoerd*, *Te laat geannuleerd*
en *Niet verschenen* kosten een credit; *Geannuleerd op tijd* en
*Niet aangerekend* niet. **Dit is een aanname — nog te bevestigen met Yens.**

## Nog niet gedaan

- Sync tussen toestellen (bewust: v1 is lokaal, zie hierboven)
- Facturen automatisch mailen
- Agenda/planning van toekomstige sessies — het Excel had dit ook niet
- Het CRM-tabblad was leeg in het Excel, dus er is niets om over te nemen
