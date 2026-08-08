alter table public.booking_browser_events
  add column if not exists guest_phone text;

comment on column public.booking_browser_events.guest_phone is
  'Telefone do hóspede revelado na Extranet da Booking, normalizado para uso operacional pela recepção.';

alter table public.booking_browser_events
  drop constraint if exists booking_browser_events_guest_phone_format;

alter table public.booking_browser_events
  add constraint booking_browser_events_guest_phone_format
  check (guest_phone is null or guest_phone ~ '^\+?[0-9]{8,15}$');

drop policy if exists "company members can read booking browser events"
  on public.booking_browser_events;

drop policy if exists booking_browser_events_owner_reception_select
  on public.booking_browser_events;

create policy booking_browser_events_owner_reception_select
on public.booking_browser_events
for select
to authenticated
using (
  has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or has_company_role(company_id, (select auth.uid()), 'recepcao'::public.app_role)
);
