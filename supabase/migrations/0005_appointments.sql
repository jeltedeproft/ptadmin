-- Planned trainings, ahead of time.
--
-- One row per participant sharing a group_id, exactly like sessions: a duo is
-- two appointments, so each person can cancel independently. Nothing here
-- consumes a credit — that only happens when the appointment is logged as done
-- and becomes a row in sessions.
--
-- Clients may read their own upcoming appointments, which is what makes a
-- calendar invite or a reminder possible later. They may not write them.

create table public.appointments (
  id               bigint generated always as identity primary key,
  coach_id         uuid not null references auth.users on delete cascade,
  client_id        bigint not null references public.clients on delete cascade,
  date             date not null,
  start_time       time not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  location         text not null check (location in ('Privéruimte', 'Aan huis', 'Online')),
  session_type     text not null
                   check (session_type in ('Solo', 'Duo', 'Semi PT', 'Trio', 'Quattro', 'Drop-in')),
  status           text not null default 'Gepland' check (status in ('Gepland', 'Afgezegd')),
  group_id         text,
  session_id       bigint references public.sessions on delete set null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index on public.appointments (coach_id, date);
create index on public.appointments (client_id);
create index on public.appointments (group_id);

create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;

alter table public.appointments enable row level security;

create policy appointments_coach_all on public.appointments
  for all using (is_coach() and coach_id = auth.uid())
  with check (is_coach() and coach_id = auth.uid());

create policy appointments_client_read on public.appointments
  for select using (owns_client(client_id));
