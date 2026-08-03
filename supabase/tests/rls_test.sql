-- Proves the row-level security in 0001_init.sql actually isolates people.
--
-- Run it in the Supabase SQL editor after applying the migration. It builds a
-- throwaway world, checks what each role can see, and ROLLS BACK — nothing is
-- left behind. Any failed expectation raises and aborts.
--
-- The anon key is public, so these policies are the only barrier between one
-- client and another's records. Re-run this after touching any policy.

begin;

create or replace function pg_temp.expect(label text, actual bigint, wanted bigint)
returns void language plpgsql as $$
begin
  if actual is distinct from wanted then
    raise exception 'FAIL % — verwacht %, kreeg %', label, wanted, actual;
  end if;
  raise notice 'ok   % (%)', label, actual;
end;
$$;

create or replace function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.as_admin()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- ------------------------------------------------------------------ fixture
-- Inserts straight into auth.users, which only works as the postgres role in
-- the SQL editor. If this block fails on a missing column, Supabase has
-- changed that table's shape — send me the error rather than working around it.
do $$
declare
  coach_a uuid := gen_random_uuid();
  coach_b uuid := gen_random_uuid();
  cli_a   uuid := gen_random_uuid();
  cli_b   uuid := gen_random_uuid();
  trainer uuid := gen_random_uuid();
  ca_id   bigint;
  cb_id   bigint;
  other   bigint;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u::text || '@test.local', '', now(), now(), now()
  from unnest(array[coach_a, coach_b, cli_a, cli_b, trainer]) u;

  update public.profiles set role = 'owner', owner_id = id where id in (coach_a, coach_b);
  -- An employee of coach A: works on A's clients, owns nothing himself.
  update public.profiles set role = 'trainer', owner_id = coach_a where id = trainer;

  -- Coach A: two clients, one of whom (Anna) has a login.
  insert into public.clients (coach_id, auth_user_id, name)
  values (coach_a, cli_a, 'Anna') returning id into ca_id;
  insert into public.clients (coach_id, name)
  values (coach_a, 'Bram') returning id into other;

  -- Coach B: a separate practice entirely.
  insert into public.clients (coach_id, auth_user_id, name)
  values (coach_b, cli_b, 'Cis') returning id into cb_id;

  insert into public.sessions (coach_id, client_id, date, location, session_type)
  values (coach_a, ca_id, current_date, 'Privéruimte', 'Solo'),
         (coach_a, other, current_date, 'Privéruimte', 'Solo'),
         (coach_b, cb_id, current_date, 'Privéruimte', 'Solo');

  insert into public.transactions (coach_id, client_id, date, location, session_type,
                                   product, product_code, credits_bought, amount)
  values (coach_a, ca_id, current_date, 'Privéruimte', 'Solo', 'Pakket 10', 'PR-SOLO-10', 10, 650),
         (coach_a, other, current_date, 'Privéruimte', 'Solo', 'Pakket 10', 'PR-SOLO-10', 10, 650);

  insert into public.inform_entries (coach_id, date, session_type, hours, hourly_rate, amount)
  values (coach_a, current_date, 'Solo PT', 1, 45, 45);

  insert into public.leads (coach_id, name) values (coach_a, 'Prospect');

  -- Settings, so coach_contact has a row to expose.
  insert into public.settings (coach_id, data)
  values (coach_a, '{"tradeName":"YENS","whatsappNumber":"+32 470 12 34 56","iban":"BE00 GEHEIM"}'::jsonb);

  insert into public.invoices (coach_id, client_id, number, date, due_date, type,
                               recipient_name, amount)
  values (coach_a, ca_id, '2026-001', current_date, current_date, 'Eigen klant', 'Anna', 650),
         (coach_a, other, '2026-002', current_date, current_date, 'Eigen klant', 'Bram', 650);

  perform set_config('pg_temp.coach_a', coach_a::text, true);
  perform set_config('pg_temp.coach_b', coach_b::text, true);
  perform set_config('pg_temp.cli_a',   cli_a::text,   true);
  perform set_config('pg_temp.trainer', trainer::text, true);
end $$;

-- --------------------------------------------------------------- coach view
do $$
declare a uuid := current_setting('pg_temp.coach_a')::uuid;
begin
  perform pg_temp.act_as(a);
  perform pg_temp.expect('coach ziet enkel eigen klanten',
    (select count(*) from public.clients), 2);
  perform pg_temp.expect('coach ziet enkel eigen sessies',
    (select count(*) from public.sessions), 2);
  perform pg_temp.expect('coach ziet eigen INFORM-uren',
    (select count(*) from public.inform_entries), 1);
  perform pg_temp.expect('coach ziet eigen leads',
    (select count(*) from public.leads), 1);
  perform pg_temp.expect('coach ziet eigen facturen',
    (select count(*) from public.invoices), 2);
  perform pg_temp.as_admin();
end $$;

-- ------------------------------------------------- coach isolation from coach
do $$
declare b uuid := current_setting('pg_temp.coach_b')::uuid;
begin
  perform pg_temp.act_as(b);
  perform pg_temp.expect('andere coach ziet enkel zijn eigen klant',
    (select count(*) from public.clients), 1);
  perform pg_temp.expect('andere coach ziet niets van coach A zijn sessies',
    (select count(*) from public.sessions), 1);
  perform pg_temp.expect('andere coach ziet geen vreemde facturen',
    (select count(*) from public.invoices), 0);
  perform pg_temp.expect('andere coach ziet geen vreemde INFORM-uren',
    (select count(*) from public.inform_entries), 0);
  perform pg_temp.as_admin();
end $$;

-- -------------------------------------------------------------- client view
do $$
declare
  a uuid := current_setting('pg_temp.cli_a')::uuid;
  blocked boolean;
begin
  perform pg_temp.act_as(a);
  perform pg_temp.expect('klant ziet enkel zichzelf',
    (select count(*) from public.clients), 1);
  perform pg_temp.expect('klant ziet enkel eigen sessies',
    (select count(*) from public.sessions), 1);
  perform pg_temp.expect('klant ziet enkel eigen aankopen',
    (select count(*) from public.transactions), 1);
  perform pg_temp.expect('klant ziet enkel eigen facturen',
    (select count(*) from public.invoices), 1);
  perform pg_temp.expect('klant ziet GEEN INFORM-uren',
    (select count(*) from public.inform_entries), 0);
  perform pg_temp.expect('klant ziet GEEN leads',
    (select count(*) from public.leads), 0);
  perform pg_temp.expect('klant ziet GEEN instellingen',
    (select count(*) from public.settings), 0);

  -- But wél de contactgegevens van zijn eigen coach, zonder iets financieels.
  perform pg_temp.expect('klant ziet de contactgegevens van zijn coach',
    (select count(*) from public.coach_contact), 1);

  begin
    perform 1 from public.coach_contact where iban is not null;
    blocked := false;
  exception when undefined_column then blocked := true;
  end;
  if not blocked then
    perform pg_temp.as_admin();
    raise exception 'FAIL iban is zichtbaar via coach_contact';
  end if;
  raise notice 'ok   coach_contact bevat geen iban';

  perform pg_temp.as_admin();
end $$;

-- --------------------------------------------------------- client cannot write
do $$
declare
  a uuid := current_setting('pg_temp.cli_a')::uuid;
  blocked boolean;
begin
  perform pg_temp.act_as(a);

  begin
    insert into public.sessions (coach_id, client_id, date, location, session_type)
    values (a, (select id from public.clients limit 1), current_date, 'Privéruimte', 'Solo');
    blocked := false;
  exception when insufficient_privilege or check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL klant kon een sessie aanmaken'; end if;
  raise notice 'ok   klant kan geen sessie aanmaken';

  update public.clients set name = 'Gehackt';
  perform pg_temp.expect('klant kan eigen naam niet wijzigen',
    (select count(*) from public.clients where name = 'Gehackt'), 0);

  -- Privilege escalation: a client must not be able to promote themselves.
  -- The WITH CHECK on profiles_self_update pins the role column, so this
  -- raises rather than quietly updating nothing.
  begin
    update public.profiles set role = 'coach' where id = a;
    blocked := false;
  exception when insufficient_privilege or check_violation then blocked := true;
  end;

  perform pg_temp.as_admin();
  perform pg_temp.expect('klant kan zichzelf geen coach maken',
    (select count(*) from public.profiles where id = a and role = 'coach'), 0);
  if not blocked then raise notice 'let op: rolwijziging werd niet geweigerd, enkel genegeerd'; end if;
end $$;

-- --------------------------------------------------------------- trainer view
-- The whole point of the role: the people, never the money.
do $$
declare
  t uuid := current_setting('pg_temp.trainer')::uuid;
  blocked boolean;
begin
  perform pg_temp.act_as(t);

  perform pg_temp.expect('trainer ziet de klanten van zijn eigenaar',
    (select count(*) from public.clients), 2);
  perform pg_temp.expect('trainer ziet de sessies',
    (select count(*) from public.sessions), 2);

  perform pg_temp.expect('trainer ziet GEEN verkopen',
    (select count(*) from public.transactions), 0);
  perform pg_temp.expect('trainer ziet GEEN facturen',
    (select count(*) from public.invoices), 0);
  perform pg_temp.expect('trainer ziet GEEN INFORM-uren',
    (select count(*) from public.inform_entries), 0);
  perform pg_temp.expect('trainer ziet GEEN instellingen',
    (select count(*) from public.settings), 0);

  -- Credits without amounts: the count is visible, the money is not.
  perform pg_temp.expect('trainer ziet wel het creditsaldo',
    (select count(*) from public.client_credits), 2);

  begin
    perform 1 from public.client_credits where amount > 0;
    blocked := false;
  exception when undefined_column then blocked := true;
  end;
  if not blocked then
    perform pg_temp.as_admin();
    raise exception 'FAIL bedrag is zichtbaar via client_credits';
  end if;
  raise notice 'ok   client_credits bevat geen bedrag';

  perform pg_temp.as_admin();
end $$;

-- ------------------------------------------------------------ anonymous view
-- anon holds no grants at all, so it is stopped before RLS is consulted.
-- A denied query here is the pass; an empty result would mean the grant leaked
-- through and only RLS was holding the line.
do $$
declare
  t text;
  denied boolean;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);

  foreach t in array array['clients', 'sessions', 'transactions', 'invoices',
                           'inform_entries', 'leads', 'settings', 'profiles'] loop
    begin
      execute format('select count(*) from public.%I', t);
      denied := false;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then
      perform pg_temp.as_admin();
      raise exception 'FAIL anoniem kon public.% lezen', t;
    end if;
  end loop;

  raise notice 'ok   anoniem wordt geweigerd op alle tabellen';
  perform pg_temp.as_admin();
end $$;

-- The grants themselves, independent of any policy.
do $$
declare leaked text;
begin
  select string_agg(distinct table_name, ', ') into leaked
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon';
  if leaked is not null then
    raise exception 'FAIL anon heeft nog rechten op: %', leaked;
  end if;
  raise notice 'ok   anon heeft nergens rechten';
end $$;

-- Every table must actually have RLS switched on; a forgotten one is a leak.
do $$
declare missing text;
begin
  select string_agg(tablename, ', ') into missing
  from pg_tables
  where schemaname = 'public'
    and tablename in ('profiles','clients','prices','transactions','sessions',
                      'inform_entries','invoices','leads','settings')
    and not rowsecurity;
  if missing is not null then
    raise exception 'FAIL RLS staat uit op: %', missing;
  end if;
  raise notice 'ok   RLS staat aan op alle tabellen';
end $$;

rollback;
