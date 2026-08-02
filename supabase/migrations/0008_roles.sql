-- Three roles instead of two.
--
--   owner   — runs the business. Sees everything, money included. Yens today,
--             his father later as a second owner with his own business.
--   trainer — works for an owner. Sees the people: clients, sessions,
--             appointments, evaluations, leads. Never the money.
--   client  — sees only their own records.
--
-- This changes what coach_id means. It used to be "the person who owns this
-- record"; it now means "the business this record belongs to". A trainer works
-- on their owner's records, so every policy resolves through owner_of() rather
-- than comparing to auth.uid() directly. For an owner the two are the same, so
-- existing rows keep working untouched.

-- ------------------------------------------------------------- profiles
-- Order matters: a CHECK constraint is validated against existing rows the
-- moment it is created. Adding it before renaming the roles would fail on every
-- row that still says 'coach'. So the old constraint comes off, the data is
-- migrated, and only then does the new constraint go on.
alter table public.profiles drop constraint if exists profiles_role_check;

-- Which business this login belongs to. An owner points at themselves.
alter table public.profiles
  add column if not exists owner_id uuid references auth.users on delete cascade;

-- Existing coaches become owners of their own business.
update public.profiles set role = 'owner' where role = 'coach';
-- Anything else unrecognised drops to the least privileged role rather than
-- blocking the migration.
update public.profiles set role = 'client'
where role not in ('owner', 'trainer', 'client');

update public.profiles set owner_id = id where role = 'owner' and owner_id is null;

alter table public.profiles
  add constraint profiles_role_check check (role in ('owner', 'trainer', 'client'));

comment on column public.profiles.owner_id is
  'The business this login works for. Self for an owner, the employer for a trainer, null for a client.';

-- ------------------------------------------------------------- helpers
create or replace function public.owner_of()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$$;

-- Owner or trainer: anyone who works with the clients.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'trainer')
  );
$$;

-- Kept so nothing that still calls it breaks; staff is the honest meaning now.
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff();
$$;

-- ------------------------------------------------------------- policies
-- People: both owner and trainer.
drop policy if exists clients_coach_all on public.clients;
create policy clients_staff_all on public.clients
  for all using (is_staff() and coach_id = owner_of())
  with check (is_staff() and coach_id = owner_of());

drop policy if exists sessions_coach_all on public.sessions;
create policy sessions_staff_all on public.sessions
  for all using (is_staff() and coach_id = owner_of())
  with check (is_staff() and coach_id = owner_of());

drop policy if exists appointments_coach_all on public.appointments;
create policy appointments_staff_all on public.appointments
  for all using (is_staff() and coach_id = owner_of())
  with check (is_staff() and coach_id = owner_of());

drop policy if exists evaluations_coach_all on public.evaluations;
create policy evaluations_staff_all on public.evaluations
  for all using (is_staff() and coach_id = owner_of())
  with check (is_staff() and coach_id = owner_of());

drop policy if exists leads_coach_all on public.leads;
create policy leads_staff_all on public.leads
  for all using (is_staff() and coach_id = owner_of())
  with check (is_staff() and coach_id = owner_of());

-- Money: owner only. A trainer gets no policy here at all, so with RLS on they
-- simply see an empty table rather than a refusal.
drop policy if exists transactions_coach_all on public.transactions;
create policy transactions_owner_all on public.transactions
  for all using (is_owner() and coach_id = auth.uid())
  with check (is_owner() and coach_id = auth.uid());

drop policy if exists invoices_coach_all on public.invoices;
create policy invoices_owner_all on public.invoices
  for all using (is_owner() and coach_id = auth.uid())
  with check (is_owner() and coach_id = auth.uid());

drop policy if exists inform_coach_all on public.inform_entries;
create policy inform_owner_all on public.inform_entries
  for all using (is_owner() and coach_id = auth.uid())
  with check (is_owner() and coach_id = auth.uid());

-- Prices: a trainer may read them to answer a question, never change them.
drop policy if exists prices_coach_all on public.prices;
create policy prices_owner_all on public.prices
  for all using (is_owner() and coach_id = auth.uid())
  with check (is_owner() and coach_id = auth.uid());

create policy prices_staff_read on public.prices
  for select using (is_staff() and coach_id = owner_of());

-- Settings hold the IBAN and the invoice numbering: owner only.
drop policy if exists settings_coach_all on public.settings;
create policy settings_owner_all on public.settings
  for all using (coach_id = auth.uid() and is_owner())
  with check (coach_id = auth.uid() and is_owner());

-- ------------------------------------------------- credits without amounts
-- A trainer has to know whether someone still has credits, but not what they
-- paid for them.
--
-- Giving them a row-level policy on transactions would not work: owner and
-- trainer are both the `authenticated` Postgres role, so a column grant cannot
-- separate them — anyone who may read a row may read its amount.
--
-- So the money column is never exposed at all. This view runs with its owner's
-- rights (no security_invoker), which bypasses the transactions policy, and
-- restricts itself to the caller's own business in the WHERE clause. It selects
-- no amount, no payment status and no invoice number, so there is nothing to
-- leak — a trainer reading it sees counts and dates only.
create or replace view public.client_credits as
select
  t.coach_id,
  t.client_id,
  t.location,
  t.session_type,
  t.product,
  t.credits_bought,
  t.expires_on,
  t.date,
  t.session_id
from public.transactions t
where t.coach_id = public.owner_of();

grant select on public.client_credits to authenticated;
