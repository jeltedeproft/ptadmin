# Wat er nog moet gebeuren

Stand op 2 augustus 2026.

## 1. Jij, eerst — de app hangt hierop vast

| # | Wat | Waarom | Duur |
|---|-----|--------|------|
| 1.1 | **Authentication → URL Configuration** in Supabase invullen (zie SETUP.md stap 5) | Zonder dit wijst elke bevestigingsmail naar `localhost:3000` en lijkt de link stuk | 2 min |
| 1.2 | `supabase/migrations/0003_prices_per_coach.sql` draaien | Anders kan een tweede coach geen eigen prijzen hebben, en faalt de eerste synchronisatie op prijzen | 1 min |
| 1.3 | **`supabase/tests/rls_test.sql` draaien en het resultaat doorgeven** | Dit is de enige controle dat de ene klant de gegevens van de andere niet ziet. Er komen echte klantgegevens in die databank | 2 min |
| 1.4 | De coach-account promoveren (SETUP.md stap 4) | Een nieuwe aanmelding is standaard `client`; zonder dit blijft de zaak-omgeving dicht | 1 min |
| 1.5 | Google Cloud-project **op Yens' account**, OAuth Client ID doorgeven | Nodig voor de agenda-koppeling. Op zijn account omdat het toestemmingsscherm zijn naam toont | 10 min |

## 2. Gaten in wat er al staat

Bekende beperkingen, geen verrassingen achteraf.

- **Verwijderen synchroniseert niet.** Een klant lokaal verwijderen laat hem op
  de server staan, en omgekeerd. De synchronisatie kent voorlopig alleen
  toevoegen en bijwerken.
- **Instellingen gaan enkel omhoog.** Ze worden verstuurd maar nooit opgehaald,
  dus een wijziging op de gsm bereikt de laptop niet.
- **Klanten kunnen nog niet uitgenodigd worden.** Niets vult
  `clients.auth_user_id`, dus wie zich aanmeldt komt in een leeg portaal
  terecht. Er moet een uitnodigingsflow komen die de login aan de klantfiche
  koppelt.
- **Synchroniseren is handwerk.** Enkel via de knop onder Meer; er is nog geen
  automatische ronde bij het opstarten of bij herstel van de verbinding.
- **Nog nooit echt gedraaid.** De vertaallaag is getest, maar er is nog geen
  enkel record naar de databank gegaan.
- **Conflicten: laatste schrijver wint.** Voldoende met één coach. Zodra twee
  mensen dezelfde fiche tegelijk aanpassen, verliest er een.

## 3. Nog te bouwen

Ruwweg in de volgorde die ik zou aanhouden.

1. **Eerste echte synchronisatie** en repareren wat daarbij bovenkomt.
2. **Uitnodigingsflow voor klanten** — zonder dat is het klantenportaal leeg.
3. **Verwijderen en instellingen** meenemen in de synchronisatie.
4. **Automatisch synchroniseren** bij opstart en bij herstel van de verbinding.
5. **Planning**: afspraken vooruit inplannen in plaats van enkel achteraf loggen.
6. **Google Agenda**: Edge Function voor de tokenuitwisseling, daarna
   tweerichtingsverkeer met de planning uit punt 5.
7. **Programma's** — eerst met Yens uitklaren hoe hij een schema opbouwt.
   Blokken met oefeningen, of een doel per periode met notities? Dat verschil
   bepaalt het datamodel.
8. **Evaluaties uitbreiden** met metingen en voortgang.
9. **Facturen mailen** en betaalherinneringen.
10. **Rapporten** — in de specificatie zelf al als "later" gemarkeerd.

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
