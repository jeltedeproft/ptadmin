-- Table privileges.
--
-- Patch for a database where 0001 already ran. These statements are also part
-- of 0001 now, so a fresh install gets them there and running this again on top
-- changes nothing — every statement is idempotent.
--
-- Why it was needed: RLS filters rows, but a role must first hold privileges on
-- the table itself. Without these grants every query from the app fails with
-- "permission denied for table clients", regardless of how the policies read.
-- Recreating the public schema also drops the default privileges Supabase
-- normally sets up, which is the other way to end up here.

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

-- 'anon' deliberately gets nothing: nobody reads this data without logging in.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
