-- PT Admin — initial schema.
--
-- Two roles:
--   coach   — Yens (later also his father). Owns his own records, sees nothing
--             of another coach's.
--   client  — a trainee. Read-only, and only ever their own rows.
--
-- Every business table carries coach_id, so a second coach is a new row rather
-- than a second database. Client access always resolves through clients.auth_user_id.
--
-- Row-level security is the ONLY thing standing between one client and another
-- client's data: the anon key ships in a public web app, so any policy gap is a
-- real leak. Every table below enables RLS explicitly, and the accompanying
-- tests in supabase/tests/rls_test.sql prove the isolation actually holds.

-- ---------------------------------------------------------------- extensions
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------- profiles
-- One row per login, created by a trigger when a user signs up.
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  role        text not null default 'client' check (role in ('coach', 'client')),
  full_name   text,
  created_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Role per login. Defaults to client: a new signup is never a coach by accident.';

-- SECURITY DEFINER so the policies below can read roles without recursing into
-- profiles'' own RLS. search_path is pinned to stop search-path hijacking.
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach'
  );
$$;

-- Own role, read without tripping profiles' own RLS. Used by the update policy
-- below to pin the role column: a client must not be able to promote themselves.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ------------------------------------------------------------------ clients
create table public.clients (
  id                bigint generated always as identity primary key,
  coach_id          uuid not null references auth.users on delete cascade,
  -- Set once the client is invited and has a login of their own.
  auth_user_id      uuid unique references auth.users on delete set null,
  name              text not null,
  billing_name      text,
  birth_date        date,
  status            text not null default 'Actief'
                    check (status in ('Actief', 'Gepauzeerd', 'Stopgezet')),
  start_date        date not null default current_date,
  location          text not null default 'Privéruimte'
                    check (location in ('Privéruimte', 'Aan huis', 'Online')),
  last_evaluation   date,
  next_evaluation   date,
  email             text,
  phone             text,
  billing_address   text,
  company_number    text,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on public.clients (coach_id);
create index on public.clients (auth_user_id);

-- Defined after public.clients: a `language sql` body is parsed and validated
-- at creation time, so the table it reads has to exist already.
create or replace function public.owns_client(cid bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clients
    where id = cid and auth_user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------------- prices
-- Versioned: base_code is the stable product, code one priced period of it.
create table public.prices (
  code            text primary key,
  coach_id        uuid not null references auth.users on delete cascade,
  base_code       text not null,
  location        text not null check (location in ('Privéruimte', 'Aan huis', 'Online')),
  session_type    text not null check (session_type in ('Solo', 'Duo', 'Semi PT')),
  product         text not null check (product in ('Losse sessie', 'Pakket 10')),
  amount          numeric(10, 2) not null check (amount >= 0),
  credits         integer not null check (credits > 0),
  validity_months integer not null default 0 check (validity_months >= 0),
  active_from     date,
  active_until    date,
  active          boolean not null default true,
  note            text,
  created_at      timestamptz not null default now()
);

create index on public.prices (coach_id, base_code);

-- ------------------------------------------------------------- transactions
create table public.transactions (
  id              bigint generated always as identity primary key,
  coach_id        uuid not null references auth.users on delete cascade,
  client_id       bigint not null references public.clients on delete cascade,
  date            date not null,
  location        text not null check (location in ('Privéruimte', 'Aan huis', 'Online')),
  session_type    text not null check (session_type in ('Solo', 'Duo', 'Semi PT')),
  product         text not null check (product in ('Losse sessie', 'Pakket 10')),
  product_code    text not null,
  credits_bought  integer not null check (credits_bought > 0),
  amount          numeric(10, 2) not null check (amount >= 0),
  validity_months integer not null default 0,
  expires_on      date,
  paid            boolean not null default false,
  paid_on         date,
  payment_method  text check (payment_method in ('Bancontact Pay', 'Overschrijving', 'Cash', 'Andere')),
  invoice_needed  boolean not null default false,
  invoice_number  text,
  -- Mogelijkheid B: a losse sessie pays for exactly one session.
  session_id      bigint,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on public.transactions (coach_id, date);
create index on public.transactions (client_id);

-- ----------------------------------------------------------------- sessions
create table public.sessions (
  id            bigint generated always as identity primary key,
  coach_id      uuid not null references auth.users on delete cascade,
  client_id     bigint not null references public.clients on delete cascade,
  date          date not null,
  location      text not null check (location in ('Privéruimte', 'Aan huis', 'Online')),
  session_type  text not null
                check (session_type in ('Solo', 'Duo', 'Semi PT', 'Trio', 'Quattro', 'Drop-in')),
  status        text not null default 'Uitgevoerd'
                check (status in ('Uitgevoerd', 'Te laat geannuleerd', 'Geannuleerd op tijd',
                                  'Niet verschenen', 'Niet aangerekend')),
  group_id      text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.sessions (coach_id, date);
create index on public.sessions (client_id);
create index on public.sessions (group_id);

alter table public.transactions
  add constraint transactions_session_fk
  foreign key (session_id) references public.sessions on delete set null;

-- ------------------------------------------------------------------- inform
-- Yens' hours billed to IN FORM. Never visible to clients: it is his other
-- income stream and none of their business.
create table public.inform_entries (
  id              bigint generated always as identity primary key,
  coach_id        uuid not null references auth.users on delete cascade,
  date            date not null,
  session_type    text not null check (session_type in ('Solo PT', 'Duo PT', 'Semi PT', 'Andere')),
  client_or_group text,
  hours           numeric(5, 2) not null check (hours > 0),
  hourly_rate     numeric(10, 2) not null check (hourly_rate >= 0),
  amount          numeric(10, 2) not null check (amount >= 0),
  invoiced        boolean not null default false,
  invoice_number  text,
  note            text,
  created_at      timestamptz not null default now()
);

create index on public.inform_entries (coach_id, date);

-- ----------------------------------------------------------------- invoices
create table public.invoices (
  id                bigint generated always as identity primary key,
  coach_id          uuid not null references auth.users on delete cascade,
  client_id         bigint references public.clients on delete set null,
  number            text not null,
  date              date not null,
  due_date          date not null,
  type              text not null check (type in ('Eigen klant', 'IN FORM')),
  recipient_name    text not null,
  recipient_address text,
  recipient_email   text,
  lines             jsonb not null default '[]'::jsonb,
  vat_amount        numeric(10, 2) not null default 0,
  amount            numeric(10, 2) not null,
  status            text not null default 'Concept'
                    check (status in ('Concept', 'Gegenereerd', 'Verzonden', 'Betaald',
                                      'Te laat', 'Geannuleerd', 'Gecrediteerd')),
  paid_on           date,
  source_type       text check (source_type in ('transaction', 'inform')),
  source_ids        bigint[] not null default '{}',
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Invoice numbers must be unique per coach; duplicates are a legal problem.
  unique (coach_id, number)
);

create index on public.invoices (coach_id, date);
create index on public.invoices (client_id);

-- -------------------------------------------------------------------- leads
-- Prospects. Never visible to clients.
create table public.leads (
  id                  bigint generated always as identity primary key,
  coach_id            uuid not null references auth.users on delete cascade,
  name                text not null,
  phone               text,
  email               text,
  source              text,
  first_contact       date not null default current_date,
  interest            text,
  wanted_location     text,
  wanted_session_type text,
  status              text not null default 'Nieuw',
  follow_up_on        date,
  note                text,
  converted_client_id bigint references public.clients on delete set null,
  created_at          timestamptz not null default now()
);

create index on public.leads (coach_id, follow_up_on);

-- ----------------------------------------------------------------- settings
create table public.settings (
  coach_id   uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['clients', 'transactions', 'sessions', 'invoices', 'settings'] loop
    execute format(
      'create trigger %I_touch before update on public.%I
       for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- --------------------------------------------------- profile on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ================================================================== SECURITY
--
-- Two independent layers, and both are needed:
--   GRANTs decide whether a role may touch a table at all;
--   RLS decides which rows it then sees.
-- Without the grants below every query fails with "permission denied"; without
-- RLS every grant is a full table read.

grant usage on schema public to authenticated, service_role;

-- Logged-in users may attempt everything; RLS decides what actually lands.
-- A client is 'authenticated' too, and is held read-only by policy, not grant.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Anything added later inherits the same rules.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- 'anon' deliberately gets nothing. Nobody reads this data without logging in,
-- so an unauthenticated request should stop at the grant, before RLS is even
-- consulted. Supabase's own default is to grant anon SELECT and lean entirely
-- on RLS; this is one layer stricter on purpose.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Enable RLS on every table. Without this line a table is readable by any
-- logged-in user, including one client reading another's records.
alter table public.profiles        enable row level security;
alter table public.clients         enable row level security;
alter table public.prices          enable row level security;
alter table public.transactions    enable row level security;
alter table public.sessions        enable row level security;
alter table public.inform_entries  enable row level security;
alter table public.invoices        enable row level security;
alter table public.leads           enable row level security;
alter table public.settings        enable row level security;

-- profiles: you can read and edit only your own, and never change your own role
-- into 'coach' (that would be a self-service privilege escalation).
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid());

-- my_role() is SECURITY DEFINER, so this comparison does not re-enter profiles'
-- own RLS. Reading the role through a plain subquery here would.
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role());

-- clients: the coach owns them; a client may read the single row that is them.
create policy clients_coach_all on public.clients
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy clients_self_read on public.clients
  for select using (auth_user_id = auth.uid());

-- prices: coach manages; clients may read so their own history is legible.
create policy prices_coach_all on public.prices
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy prices_client_read on public.prices
  for select using (active);

-- transactions / sessions / invoices: coach writes, client reads only their own.
create policy transactions_coach_all on public.transactions
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy transactions_client_read on public.transactions
  for select using (owns_client(client_id));

create policy sessions_coach_all on public.sessions
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy sessions_client_read on public.sessions
  for select using (owns_client(client_id));

create policy invoices_coach_all on public.invoices
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy invoices_client_read on public.invoices
  for select using (client_id is not null and owns_client(client_id));

-- inform, leads, settings: coach only. No client policy at all, so with RLS on
-- and no matching policy a client simply sees an empty table.
create policy inform_coach_all on public.inform_entries
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy leads_coach_all on public.leads
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy settings_coach_all on public.settings
  for all using (coach_id = auth.uid())
  with check (coach_id = auth.uid());
