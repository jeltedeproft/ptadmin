-- When an invoice went out, and when a reminder followed.
--
-- Kept apart from `status` on purpose: status is where the invoice stands,
-- these are what has been done about it. "Sent on the 3rd, reminded on the
-- 20th, still unpaid" is a different situation from "sent yesterday", and the
-- dashboard should be able to tell them apart.

alter table public.invoices add column if not exists sent_on date;
alter table public.invoices add column if not exists reminder_sent_on date;
