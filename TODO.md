# Stand van zaken

Bijgewerkt op 3 augustus 2026.

De app staat op **https://jeltedeproft.github.io/ptadmin/** en hangt aan
Supabase. Alle acht migraties zijn gedraaid, de RLS-test loopt zonder fouten,
en de eerste echte synchronisatie is gelukt.

**Nu eerst een week echt gebruiken voor er nog iets bijkomt.** Er zitten meer
dan tweehonderd tests op de logica, maar geen enkel scherm is met de hand
doorlopen. Een week met echte klanten vindt meer dan een week bijbouwen.

## Wat Yens best uitprobeert

Op volgorde van hoe waarschijnlijk het is dat er iets misloopt. De eerste twee
raken aan geld en credits, dus daar valt een fout het meest op.

### 1. Van plannen tot credits

De langste keten in de app, en de enige plek waar een fout stil kan blijven.

- Plan een afspraak, vink ze af als **uitgevoerd** → gaat het creditsaldo met
  één omlaag?
- Vink er een af als **te laat geannuleerd** → moet ook een credit kosten.
- Vink er een af als **op tijd geannuleerd** → mag niets kosten.
- Plan een duo, laat één iemand afzeggen en de ander komen → enkel die ene
  verliest een credit.
- Verkoop een **losse sessie** en log daarna de training → het saldo hoort op
  nul te blijven, en de losse sessie op "gegeven" te springen.

### 2. Facturen

- Maak een factuur vanuit een verkoop, download de pdf → staat de klantnaam
  erop, klopt het bedrag, klopt het btw-zinnetje?
- Sluit een INFORM-maand af → één regel per trainingstype, geen klantnamen.
- Zet een factuur op verstuurd en kijk of ze bij "te laat" opduikt zodra de
  vervaldatum voorbij is.

### 3. Op de gsm

Waar de app het meest gebruikt gaat worden.

- Een sessie loggen na een training: lukt dat in minder dan twintig seconden?
- Zet de app op het beginscherm en probeer ze **met het internet uit**. Loggen
  hoort gewoon te werken; synchroniseren gebeurt vanzelf zodra er weer
  verbinding is.

### 4. Een klant toegang geven

- Vul een e-mailadres in bij een klant, synchroniseer, en stuur het bericht
  door dat op de klantfiche staat.
- Laat die persoon zich aanmelden met **datzelfde adres** → hun overzicht hoort
  meteen ingevuld te staan. Met een ander adres krijgen ze uitleg, geen leeg
  scherm.

### 5. Op twee toestellen

- Voer iets in op de gsm, synchroniseer, kijk op de laptop.
- Verwijder iets op het ene toestel → het hoort ook op het andere te
  verdwijnen, niet terug te komen.

## Wat opschrijven

Voor elk probleem: **op welk scherm**, **wat je deed**, **wat je verwachtte**,
**wat er gebeurde**. Een schermafbeelding zegt vaak genoeg.

## Nog niet gebouwd

- **Programma's** — wacht op Yens. Is een programma een schema met blokken en
  oefeningen, of een doel per periode met notities? Dat verschil bepaalt het
  datamodel, dus daarop gokken kost meer dan het oplevert.

## Bekende beperkingen

- **Conflicten: laatste schrijver wint.** Prima zolang Yens alleen schrijft.
  Zodra er een tweede trainer bijkomt die op een ander toestel dezelfde fiche
  aanpast, verliest er een.
- **Facturen versturen loopt via zijn eigen mailprogramma.** De pdf moet hij
  zelf als bijlage toevoegen; een mailtoLink kan dat niet dragen. Automatisch
  versturen vraagt een mailprovider.
- **Geen agenda-synchronisatie in twee richtingen.** Bewust: eenrichting via
  agenda-uitnodigingen doet wat nodig is zonder Google Cloud-project en zonder
  verificatie.

## Nog te beslissen

- **Toegangscode naast aanmelden.** Er zitten twee sloten op de app. Met een
  account erbij is de code misschien overbodig, of net handig als snelle
  vergrendeling op de gsm.
- **GDPR.** Er staan nu klantgegevens op een server. Yens is
  verwerkingsverantwoordelijke: klanten informeren, en een
  verwerkersovereenkomst met Supabase. Voor je vader wordt dat zwaarder, want
  dan gaat het om gezondheidsgegevens.
- **Vaders versie.** Het schema kan het aan: hij wordt een tweede eigenaar met
  zijn eigen zaak, geen aparte app. De vraag is of de fysiotherapie-kant genoeg
  verschilt om eigen schermen te vragen.

## Ideeën voor later

In de volgorde die ik zou aanhouden, als de week met echt gebruik niets
dringenders oplevert.

1. **Terugkerende afspraken** — de meeste klanten trainen wekelijks op
   hetzelfde uur, en dat wordt nu elke keer met de hand ingegeven.
2. **Herinneringen naar klanten** — "morgen om 09:30". Minder no-shows, maar er
   moet eerst een kanaal gekozen worden: e-mail via een provider, of
   pushmeldingen die enkel de geïnstalleerde app bereiken.
3. **Voortgangsfoto's** bij een evaluatie. Staat in zijn specificatie en de
   opslag zit al in het project, maar het zijn gevoelige persoonsgegevens.
4. **Klanten zelf laten boeken** uit vrije momenten. Eerst vragen of hij dat
   wel wil; veel trainers houden die controle liever zelf.
