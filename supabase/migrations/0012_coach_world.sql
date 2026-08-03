-- Intake as a client status, and the goal shown on the client card.
--
-- The coach spec filters clients on "intake" alongside actief and inactief, so
-- it belongs in the status rather than being inferred from a missing session.
--
-- Order matters: the CHECK is validated the moment it is created, so the old
-- one comes off first and the new one goes on afterwards. No existing row says
-- 'Intake', so nothing needs migrating in between.

alter table public.clients drop constraint if exists clients_status_check;

alter table public.clients
  add constraint clients_status_check
  check (status in ('Intake', 'Actief', 'Gepauzeerd', 'Stopgezet'));

-- What this client is working towards. Short, and shown on their card.
alter table public.clients add column if not exists goal text;

comment on column public.clients.goal is
  'Hoofddoel in één zin, zoals het op de klantkaart staat.';
