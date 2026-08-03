-- Recorded consent, and the coach's WhatsApp number.
--
-- Health details are a special category under GDPR, so consent has to be
-- explicit *and* demonstrable. Asking at the intake is not enough on its own —
-- what matters afterwards is being able to show when someone agreed and to
-- which wording. Hence a date plus a version, not a boolean.
--
-- Withdrawal simply clears the date: no date means no consent, which is the
-- safe default for a column that did not exist yet on older rows.

alter table public.clients add column if not exists consent_health_on date;
alter table public.clients add column if not exists consent_health_version text;
alter table public.clients add column if not exists consent_photos_on date;
alter table public.clients add column if not exists consent_photos_version text;

comment on column public.clients.consent_health_on is
  'Date the client agreed to health data being kept. Null means no consent.';
comment on column public.clients.consent_health_version is
  'Which version of the consent text was agreed to, so old consents stay traceable.';

-- A client may read their own consent state — it is about them, and they have
-- to be able to see what they agreed to. Writing stays with the coach, who
-- records it at the intake. Both are already covered by the existing policies
-- on public.clients; no new policy is needed.
