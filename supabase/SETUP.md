# Supabase opzetten

Eenmalig, ongeveer tien minuten. Ik kan dit niet voor je doen — er is een
account voor nodig.

## 1. Project aanmaken

1. Ga naar [supabase.com](https://supabase.com) → **New project**
2. Naam `ptadmin`, regio **Frankfurt (eu-central-1)** — EU-regio, zodat de
   klantgegevens de EU niet verlaten. Dat scheelt een hoop bij GDPR.
3. Kies een sterk databasewachtwoord en bewaar het in je wachtwoordmanager.

## 2. Schema installeren

1. In het project → **SQL Editor** → **New query**
2. Plak de volledige inhoud van `supabase/migrations/0001_init.sql` en voer uit.
3. Nieuwe query → plak `supabase/migrations/0002_grants.sql` en voer uit.
   (Zit ook al in 0001; los uitvoeren is bedoeld voor een databank waar 0001
   al gedraaid heeft. Twee keer draaien kan geen kwaad.)
4. Nieuwe query → plak `supabase/migrations/0003_prices_per_coach.sql` en voer uit.
5. Nieuwe query → plak `supabase/tests/rls_test.sql` en voer uit.

Die tweede stap is niet optioneel. Hij bouwt twee coaches met eigen klanten,
controleert wie wat ziet, en draait alles terug. Je hoort in de output enkel
`ok` te zien. Bij een `FAIL` moet je stoppen: dan lekt de ene klant gegevens
van de andere, en de anon-sleutel staat in een publieke webapp.

## 3. Sleutels ophalen

**Project Settings → API**, en geef me:

- **Project URL** — `https://xxxx.supabase.co`
- **anon public key** — de lange `eyJ…`

Beide mogen in de repo: de anon-sleutel is bedoeld om publiek te zijn en wordt
volledig afgeschermd door de RLS uit stap 2.

> De **service_role** sleutel staat er ook. Die omzeilt alle RLS. Zet die
> nooit in de app, nooit in de repo, en stuur hem me niet door.

## 4. Jezelf coach maken

Een nieuwe login is standaard `client` — een aanmelding maakt van niemand per
ongeluk een coach. Na Yens' eerste aanmelding, in de SQL Editor:

```sql
update public.profiles set role = 'coach'
where id = (select id from auth.users where email = 'ydeproft@gmail.com');
```

## 5. Terugkeer-URL's instellen

Zonder deze stap wijst de bevestigingsmail naar `http://localhost:3000` — de
standaard van Supabase — en lijkt de link niets te doen.

**Authentication → URL Configuration**:

- **Site URL**: `https://jeltedeproft.github.io/ptadmin/`
- **Redirect URLs**, één per regel:
  - `https://jeltedeproft.github.io/ptadmin/`
  - `http://localhost:5173/`

Zet er geen `#/...` achter. De router gebruikt dat deel van de URL zelf, en
Supabase vergelijkt de volledige string met deze lijst.

## 6. E-mail instellen

**Authentication → Providers → Email**: laat "Confirm email" aan staan.
Voor de gratis tier volstaat de ingebouwde mail; bij meer volume koppel je
later een eigen SMTP.

---

# Google Agenda

Ook eenmalig, en ook alleen jij kan dit.

1. [console.cloud.google.com](https://console.cloud.google.com) → nieuw project `ptadmin`
2. **APIs & Services → Library** → zoek *Google Calendar API* → **Enable**
3. **OAuth consent screen**: type **External**, app naam `PT Admin`,
   scope `https://www.googleapis.com/auth/calendar.events`.
   Zolang de app in **Testing** staat, voeg je Yens' Google-adres toe bij
   *Test users*. Publiceren is pas nodig als er meer dan honderd gebruikers zijn.
4. **Credentials → Create credentials → OAuth client ID**
   - Type: **Web application**
   - Authorised JavaScript origins:
     - `https://jeltedeproft.github.io`
     - `http://localhost:5173`
   - Authorised redirect URIs:
     - `https://jeltedeproft.github.io/ptadmin/`
     - `http://localhost:5173/`
5. Geef me de **Client ID** (`…apps.googleusercontent.com`).

De **client secret** heb ik niet nodig en mag je niet delen: de app gebruikt
de PKCE-flow, die is net bedoeld om zonder secret te werken in een browser.

---

# Wat er daarna gebeurt

Met die twee waarden zet ik de app om:

1. Supabase-client en aanmelden, met rolgebaseerde toegang
2. Migratie van de huidige lokale gegevens naar de databank
3. Lokaal-eerst blijven werken: de app blijft in IndexedDB schrijven en
   synchroniseert op de achtergrond, zodat een sessie loggen ook werkt met
   slechte ontvangst in de zaal
4. Klantenportaal
5. Planning met tweerichtings-synchronisatie naar Google Agenda
