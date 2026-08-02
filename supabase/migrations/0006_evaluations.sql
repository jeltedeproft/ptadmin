-- Evaluations with measurements.
--
-- Until now a client carried only two dates, so progress lived in Yens' head.
-- Each evaluation is its own row, which is what makes "twelve kilos down since
-- March" answerable.
--
-- Every measurement is nullable on purpose: not all of them get taken every
-- time, and a half-filled evaluation is still worth keeping.
--
-- Clients may read their own — seeing your own progress is the point of the
-- portal — but never write them.

create table public.evaluations (
  id            bigint generated always as identity primary key,
  coach_id      uuid not null references auth.users on delete cascade,
  client_id     bigint not null references public.clients on delete cascade,
  date          date not null,
  weight_kg     numeric(5, 1) check (weight_kg > 0),
  body_fat_pct  numeric(4, 1) check (body_fat_pct between 0 and 100),
  waist_cm      numeric(5, 1) check (waist_cm > 0),
  chest_cm      numeric(5, 1) check (chest_cm > 0),
  hip_cm        numeric(5, 1) check (hip_cm > 0),
  arm_cm        numeric(5, 1) check (arm_cm > 0),
  thigh_cm      numeric(5, 1) check (thigh_cm > 0),
  goal          text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.evaluations (coach_id, date);
create index on public.evaluations (client_id, date);

create trigger evaluations_touch before update on public.evaluations
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.evaluations to authenticated;
grant all on public.evaluations to service_role;

alter table public.evaluations enable row level security;

create policy evaluations_coach_all on public.evaluations
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy evaluations_client_read on public.evaluations
  for select using (owns_client(client_id));
