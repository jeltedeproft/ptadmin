-- How a client reaches their coach.
--
-- The client portal needs the coach's WhatsApp number and business name. Those
-- live in public.settings, which is owner-only and must stay that way: the same
-- row holds the IBAN, the invoice numbering and the tax thresholds. Opening it
-- up would hand a client the lot.
--
-- So the four harmless fields get their own view. Same approach as
-- client_credits: it runs with its owner's rights, so the settings policy does
-- not block it, and the WHERE clause is what limits who sees which row —
-- your own business if you are staff, your coach's if you are a client.
--
-- Nothing financial is selected, so there is nothing to leak.

create or replace view public.coach_contact as
select
  s.coach_id,
  s.data ->> 'tradeName'      as trade_name,
  s.data ->> 'businessName'   as business_name,
  s.data ->> 'whatsappNumber' as whatsapp_number,
  s.data ->> 'email'          as email
from public.settings s
where
  -- Staff: their own business.
  s.coach_id = public.owner_of()
  -- Client: the business whose client record is theirs.
  or s.coach_id in (
    select c.coach_id from public.clients c where c.auth_user_id = auth.uid()
  );

grant select on public.coach_contact to authenticated;

comment on view public.coach_contact is
  'Contact details a client may see. Deliberately excludes IBAN, invoice numbering and thresholds.';
