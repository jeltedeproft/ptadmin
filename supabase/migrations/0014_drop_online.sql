-- Online verdwijnt als locatie.
--
-- Het was een eenmalige uitzondering en geen aanbod, dus het hoort niet in
-- elke keuzelijst te blijven staan.
--
-- Bestaande rijen mogen daar niet stilzwijgend door ongeldig worden. Wat op
-- 'Online' stond gaat naar 'Aan huis' — de dichtste betekenis, want beide zijn
-- "niet in de privéruimte". Bij de klant blijft wél een notitie staan dat het
-- oorspronkelijk online was, zodat de historiek niet stiekem herschreven wordt.
--
-- Volgorde: eerst de gegevens omzetten, dan pas de constraints aanspannen. Een
-- CHECK wordt gecontroleerd op het moment dat hij aangemaakt wordt.

-- ------------------------------------------------------- historiek bewaren
update public.clients
set note = trim(both E'\n' from coalesce(note, '') || E'\nTrainde online (locatie Online is afgeschaft).')
where location = 'Online';

-- ------------------------------------------------------------ data omzetten
update public.clients      set location = 'Aan huis' where location = 'Online';
update public.sessions     set location = 'Aan huis' where location = 'Online';
update public.transactions set location = 'Aan huis' where location = 'Online';
update public.appointments set location = 'Aan huis' where location = 'Online';

-- De online prijzen zijn nooit verkocht. Een transactie bewaart haar eigen
-- bedrag en productcode, dus die rijen wissen raakt geen enkele verkoop.
delete from public.prices where location = 'Online';

-- --------------------------------------------------------- constraints aan
alter table public.clients drop constraint if exists clients_location_check;
alter table public.clients
  add constraint clients_location_check check (location in ('Privéruimte', 'Aan huis'));

alter table public.sessions drop constraint if exists sessions_location_check;
alter table public.sessions
  add constraint sessions_location_check check (location in ('Privéruimte', 'Aan huis'));

alter table public.transactions drop constraint if exists transactions_location_check;
alter table public.transactions
  add constraint transactions_location_check check (location in ('Privéruimte', 'Aan huis'));

alter table public.appointments drop constraint if exists appointments_location_check;
alter table public.appointments
  add constraint appointments_location_check check (location in ('Privéruimte', 'Aan huis'));

alter table public.prices drop constraint if exists prices_location_check;
alter table public.prices
  add constraint prices_location_check check (location in ('Privéruimte', 'Aan huis'));
