-- prices.code was a global primary key, so a productcode could exist only once
-- across the whole database. That works with one coach and breaks the moment a
-- second one has his own PR-SOLO-10 — which is the entire reason coach_id is on
-- every table. The key is the pair.
--
-- Safe to run on a database that already holds prices: the rows keep their
-- values, only the constraint changes.

alter table public.prices drop constraint if exists prices_pkey;
alter table public.prices add primary key (coach_id, code);

-- Lookups by productcode within one coach's catalogue.
create index if not exists prices_coach_base_code_idx on public.prices (coach_id, base_code);
