# Van huidige app naar de uitgewerkte specificatie

Analyse van "APP uitgewerkt" (46 pagina's) tegenover wat er vandaag staat.
Opgesteld 3 augustus 2026.

## Eerst het goede nieuws

De opbouw klopt al. De drie werelden bestaan, hangen op één centrale databank,
en de rechten zijn er: een klant ziet enkel zichzelf, een trainer ziet de
mensen maar niet het geld, een eigenaar ziet alles. Dat is precies wat de nota
als uitgangspunt neemt, inclusief de rechtenmatrix op pagina 43.

Wat er staat en blijft:

| Uit de specificatie | Status |
|---|---|
| Drie werelden op dezelfde data | Staat |
| Klant ziet enkel eigen gegevens | Staat, met RLS bewezen |
| Coach zonder financiële toegang | Staat |
| Credits met vervaldatum en FIFO | Staat |
| Groepssessies per deelnemer | Staat |
| Afspraken plannen en afvinken | Staat |
| Historische tarieven | Staat |
| Facturen met pdf en herinneringen | Staat |
| INFORM-maandafsluiting | Staat |
| Btw- en sociale grensbewaking | Staat |
| Evaluaties met metingen | Staat |
| Leads met fases | Staat |
| Rapporten en CSV-export | Staat |
| Agenda-uitnodigingen | Staat |

## Nu de schaal

De rest van de nota is geen uitbreiding van deze app — het is een tweede,
veel groter product er bovenop. Trainingsuitvoering met video, zelf boeken met
wachtlijst, dagelijkse check-ins, chat, programmabibliotheek, kostenbeheer,
auditlog. Dat is de omvang van Trainerize of PT Distinction, niet van een paar
schermen erbij.

Dat is geen bezwaar, maar het is wel een andere tijdlijn. Alles tegelijk
proberen levert acht halve modules op. Beter één wereld per keer af.

## Wat ik zou aanraden

### Fase A — afmaken wat begonnen is

Klein werk, en het maakt de app meteen bruikbaarder.

1. **Terugkerende afspraken.** Staat expliciet in de nota (pagina 17) en is de
   grootste dagelijkse tijdwinst.
2. **Betalingen als eigen record.** Vandaag zit betaling vast aan de verkoop.
   De nota wil gedeeltelijke betalingen, meerdere betalingen per verkoop en
   terugbetalingen. Dat is een modelwijziging, dus liefst vroeg.
3. **Auditlog.** Pagina 40. Cross-cutting: achteraf inbouwen betekent elk
   schrijfpad opnieuw langsgaan. Nu doen is veel goedkoper.
4. **Kostenbeheer.** Pagina 33. Eenvoudig, en zonder kosten is "geschat
   resultaat" op het dashboard eigenlijk niet te berekenen.

### Fase B — de klantwereld echt bruikbaar maken

Vandaag ziet een klant enkel zijn credits en sessies. De nota wil een
begeleidingsomgeving.

5. **Zelf boeken**, met beschikbaarheid, boekingsregels, verplaatsen binnen 24
   uur, en de gevolgen vooraf tonen. Inclusief wachtlijst.
6. **Dagelijkse check-in** en de signaalregels die eruit volgen. Dit is wat de
   coachingwereld voedt.
7. **Vandaag-scherm** voor de klant: wat moet ik doen, wanneer train ik, wat
   zei mijn coach.

### Fase C — programma's en training

Het grootste blok, en het meest waardevolle voor de coaching zelf.

8. **Programmastructuur**: traject, fase, blok, week, training, oefening.
9. **Oefeningenbibliotheek** met video, cues, regressies en progressies.
10. **Trainingsuitvoering** door de klant: sets afvinken, gewicht, herhalingen,
    RPE, rusttimer, pijn melden.
11. **Templates** en programma's toewijzen per klant.

### Fase D — communicatie

12. **Chat** gekoppeld aan training, oefening, check-in of evaluatie in plaats
    van één lange stroom.
13. **Berichtsjablonen.**

## Waar ik nu al voor waarschuw

**Medische gegevens: toestemming wordt nu vastgelegd.** Yens vraagt het al bij
de intake, wat klopt. Maar toestemming vragen en toestemming kúnnen aantonen
zijn twee verschillende dingen: bij een klacht telt enkel wat je kan laten
zien. Daarom staat er nu per klant een datum én de versie van de tekst waarmee
akkoord werd gegaan, met de tekst zelf erbij op het scherm. Intrekken wist de
datum.

Wat nog moet: een bewaartermijn afspreken, en een verwerkersregister opstellen.
Dat laatste is een document, geen code.

**Video: beslist.** Oefenvideo's komen op YouTube (niet-vermeld) en de app
bewaart enkel de link. Geen opslagkosten, geen bandbreedte, en Yens kan een
video vervangen zonder de app aan te raken.

De video's bestaan nog niet, dus een oefening zonder link toont straks een
rustige placeholder op de plaats waar de video komt — niet een kapot kader en
niet een lege ruimte. De oefening blijft bruikbaar met enkel tekst en cues.

Video's die klanten zelf uploaden (techniek laten nakijken) zijn een aparte
vraag: die kunnen niet op YouTube en vragen wél opslag. Voorlopig lost
WhatsApp dat op.

**Zelf boeken verandert de creditlogica.** De nota introduceert
*gereserveerde* credits naast vrije en verbruikte. Een geboekte afspraak houdt
een credit vast zonder ze te verbruiken, en een tijdige annulatie geeft ze
terug. Het huidige model kent dat onderscheid niet. Dit raakt de kern, dus
best in één keer goed.

**Automatische progressie.** De nota is er zelf voorzichtig in, en terecht:
gewichten laten oplopen bij iemand met pijn of een medische context is geen
software-beslissing. Voorstel doen, coach laat goedkeuren.

**Chat: beslist, en niet gebouwd.** Geen berichten in de app. Een klant tikt op
de WhatsApp-knop en komt in een gesprek met Yens; hij doet hetzelfde vanaf de
klantfiche. Dat is bewust: een inbox in de app belooft stilzwijgend
bereikbaarheid rond de klok, en dit houdt het gesprek waar beiden toch al
zitten. Staat er.

Wat daarmee vervalt uit de nota: de interne inbox, berichten gekoppeld aan een
oefening of check-in, en de berichtsjablonen. Als dat later toch nodig blijkt,
is het een aparte beslissing en geen vergetelheid.

## Wat ik niet zou bouwen

- **Streaks, badges, confetti.** De vormgevingsnota verbiedt ze expliciet, en
  terecht voor dit publiek.
- **Grafieken zonder data.** Twaalf maanden nullen omdat het technisch kan.
- **Volledige voedingsmodule.** Staat niet in de nota en is een product op
  zich.

## Volgorde die ik zou aanhouden

Fase A afwerken, dan Yens een maand laten draaien met terugkerende afspraken en
kostenbeheer erbij. Pas daarna beslissen of de klantwereld uit fase B er echt
moet komen, want dat is het punt waarop dit van een administratie-app een
begeleidingsplatform wordt — met de bijhorende verantwoordelijkheid.
