-- Linking a client's login to their client record.
--
-- A client signs up like anyone else, which leaves them with a profile but no
-- connection to the clients row their coach created — so they land in an empty
-- portal. They cannot make that connection themselves: RLS only lets the coach
-- write to clients, and rightly so.
--
-- This function bridges it, running as its owner so it can perform the one
-- update the caller may not. It is deliberately narrow:
--   * only ever touches the caller's own row (auth.uid()),
--   * only matches a record that nobody has claimed yet,
--   * only on a *confirmed* address, so possession of the mailbox is proven.
-- Without that last check, anyone could claim a client record by signing up
-- with someone else's e-mail address.

create or replace function public.claim_client_record()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cid           bigint;
  caller_email  text;
  confirmed_at  timestamptz;
begin
  select u.email, u.email_confirmed_at
    into caller_email, confirmed_at
  from auth.users u
  where u.id = auth.uid();

  if caller_email is null or confirmed_at is null then
    return null;
  end if;

  -- Already linked: hand back the same record rather than claiming a second.
  select id into cid from public.clients where auth_user_id = auth.uid() limit 1;
  if cid is not null then
    return cid;
  end if;

  select c.id into cid
  from public.clients c
  where c.auth_user_id is null
    and c.email is not null
    and lower(trim(c.email)) = lower(trim(caller_email))
  limit 1;

  if cid is not null then
    update public.clients set auth_user_id = auth.uid() where id = cid;
  end if;

  return cid;
end;
$$;

revoke all on function public.claim_client_record() from public, anon;
grant execute on function public.claim_client_record() to authenticated;

-- A client record belongs to at most one login.
create unique index if not exists clients_auth_user_unique
  on public.clients (auth_user_id) where auth_user_id is not null;
