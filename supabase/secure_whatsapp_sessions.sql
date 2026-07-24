-- Review and run in the Supabase SQL Editor only after approval.
-- The Edge Function uses service_role and continues to insert/update normally.
-- Authenticated staff can only read sessions for companies they belong to.

alter table public.whatsapp_reservation_sessions enable row level security;

drop policy if exists whatsapp_reservation_sessions_staff_select
on public.whatsapp_reservation_sessions;

drop policy if exists whatsapp_sessions_company_select
on public.whatsapp_reservation_sessions;

create policy whatsapp_sessions_company_select
on public.whatsapp_reservation_sessions
for select
to authenticated
using (
  company_id is not null
  and public.is_company_member(company_id, (select auth.uid()))
);

revoke all on public.whatsapp_reservation_sessions from anon;
revoke insert, update, delete on public.whatsapp_reservation_sessions from authenticated;
grant select on public.whatsapp_reservation_sessions to authenticated;
grant all on public.whatsapp_reservation_sessions to service_role;
