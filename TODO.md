# Wat er nog moet gebeuren

Stand op 2 augustus 2026.

## 1. Jij, eerst — de app hangt hierop vast

| # | Wat | Waarom | Duur |
|---|-----|--------|------|
| ~~1.1~~ | ~~Authentication → URL Configuration~~ | **Gedaan** | |
| ~~1.2~~ | ~~`0003_prices_per_coach.sql`~~ | **Gedaan** | |
| ~~1.3~~ | ~~`rls_test.sql`~~ | **Gedaan, zonder fouten.** Klant-tot-klant afscherming is daarmee aangetoond | |
| 1.4 | Een coach-account promoveren (SETUP.md stap 4) | Een nieuwe aanmelding is standaard `client`; zonder dit blijft de zaak-omgeving dicht. Kan met je eigen account, om niet op Yens te moeten wachten | 1 min |
| 1.5 | Beslissen: heeft Yens **tweerichtings**-synchronisatie nodig? | Zie hieronder. Eenrichting kost geen Google-project en geen verificatie | — |

## 2. Gaten in wat er al staat

Bekende beperkingen, geen verrassingen achteraf.

- **Conflicten: laatste schrijver wint.** Voldoende met één coach. Zodra twee
  mensen dezelfde fiche tegelijk aanpassen, verliest er een.
- **Facturen versturen loopt via het eigen mailprogramma.** De pdf moet zelf als
  bijlage toegevoegd worden; een mailtoLink kan dat niet dragen. Echt
  automatisch versturen vraagt een mailprovider.
- **Niets is in een browser nagekeken.** De logica zit vol tests, maar geen
  enkel scherm is met de hand doorlopen.

## 3. Nog te bouwen

Afgewerkt sinds de vorige lijst: eerste synchronisatie, uitnodigingsflow,
verwijderen en instellingen in de synchronisatie, automatisch synchroniseren,
planning, agenda-uitnodigingen, evaluaties met metingen, facturen versturen
met herinneringen, en rapporten.

Wat rest:
6. **Agenda-koppeling.** Twee verschillende mechanismen, bewust:
   - **Klanten** krijgen een agenda-uitnodiging (`.ics`) per mail, of een eigen
     abonneerlink. Geen account, geen toestemmingsscherm, werkt in Google,
     Apple en Outlook. Zoals elk boekingssysteem het doet: je stuurt een
     uitnodiging, je vraagt geen toegang tot iemands agenda.
   - **Yens** koppelt wél zijn Google-account, maar enkel als hij afspraken ook
     rechtstreeks in Google aanmaakt en die terug in de app wil zien. Dat vraagt
     één Google Cloud-project voor de hele app — niet één per gebruiker — plus
     een Edge Function voor de tokenuitwisseling. Let op: `calendar.events` is
     een gevoelige scope, dus in Testing-modus verloopt het token elke 7 dagen
     en moet hij wekelijks opnieuw koppelen. Dat wegwerken vraagt een
     verificatie bij Google.

   Als eenrichting volstaat, valt dat hele traject weg en gebruiken we voor
   Yens hetzelfde `.ics`-mechanisme als voor de klanten.
7. **Programma's** — eerst met Yens uitklaren hoe hij een schema opbouwt.
   Blokken met oefeningen, of een doel per periode met notities? Dat verschil
   bepaalt het datamodel, en daarop gokken kost meer dan het oplevert.

## 4. Nog te beslissen

- **Toegangscode naast aanmelden.** Er zitten nu twee sloten op de app. Met een
  account erbij is de code misschien overbodig, of net handig als snelle
  vergrendeling op de gsm.
- **GDPR.** Er staan nu klantgegevens op een server in plaats van op één
  toestel. Yens is daarmee verwerkingsverantwoordelijke: klanten informeren,
  en een verwerkersovereenkomst met Supabase. Voor je vader wordt dat zwaarder,
  want dan gaat het om gezondheidsgegevens.
- **Vaders versie.** Zelfde app met een tweede coach-account, of een aparte
  variant? Het schema kan het aan; de vraag is of de fysiotherapie-kant
  genoeg verschilt om apart te zetten.
