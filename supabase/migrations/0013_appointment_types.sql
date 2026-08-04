-- Intake and Persoonlijk as agenda entries.
--
--   Intake      — a first meeting. It is a real session and appears in the
--                 history, but it was never bought, so it never costs a credit.
--   Persoonlijk — time blocked for himself. No client at all, and it never
--                 becomes a session.
--
-- That second one is why client_id has to become nullable: a personal block
-- belongs to nobody. Everything else still requires a client, which is enforced
-- in the app rather than the column, since the constraint now depends on type.
--
-- The CHECK constraints go off before they go on, so existing rows are never
-- measured against a list they predate.

alter table public.appointments alter column client_id drop not null;

alter table public.appointments drop constraint if exists appointments_session_type_check;
alter table public.appointments
  add constraint appointments_session_type_check
  check (session_type in ('Solo', 'Duo', 'Semi PT', 'Trio', 'Quattro', 'Drop-in',
                          'Intake', 'Persoonlijk'));

-- A personal block has no client; anything else must have one.
alter table public.appointments drop constraint if exists appointments_client_required;
alter table public.appointments
  add constraint appointments_client_required
  check (session_type = 'Persoonlijk' or client_id is not null);

alter table public.sessions drop constraint if exists sessions_session_type_check;
alter table public.sessions
  add constraint sessions_session_type_check
  check (session_type in ('Solo', 'Duo', 'Semi PT', 'Trio', 'Quattro', 'Drop-in', 'Intake'));
