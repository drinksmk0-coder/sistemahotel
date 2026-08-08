drop policy if exists "owners can review booking browser events"
  on public.booking_browser_events;

create policy "owners can review booking browser events"
on public.booking_browser_events
for update
to authenticated
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = booking_browser_events.company_id
      and cm.user_id = (select auth.uid())
      and cm.ativo = true
      and cm.role = 'dono'::public.app_role
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = booking_browser_events.company_id
      and cm.user_id = (select auth.uid())
      and cm.ativo = true
      and cm.role = 'dono'::public.app_role
  )
);
