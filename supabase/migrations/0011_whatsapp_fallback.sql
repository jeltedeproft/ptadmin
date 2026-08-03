-- WhatsApp falls back to the ordinary phone number.
--
-- There are two fields because they can differ: the phone number is printed on
-- invoices, the WhatsApp number is where clients message. But for most people
-- they are the same number, and typing it twice is a trap — leaving the
-- WhatsApp field empty silently hides the button with no hint as to why.
--
-- So an empty WhatsApp number now means "use the phone number". Filling it in
-- still wins, for anyone who wants a separate business line.

create or replace view public.coach_contact as
select
  s.coach_id,
  s.data ->> 'tradeName'    as trade_name,
  s.data ->> 'businessName' as business_name,
  coalesce(
    nullif(trim(s.data ->> 'whatsappNumber'), ''),
    nullif(trim(s.data ->> 'phone'), '')
  ) as whatsapp_number,
  s.data ->> 'email'        as email
from public.settings s
where
  s.coach_id = public.owner_of()
  or s.coach_id in (
    select c.coach_id from public.clients c where c.auth_user_id = auth.uid()
  );

grant select on public.coach_contact to authenticated;
