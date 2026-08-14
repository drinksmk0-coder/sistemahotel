create table if not exists public.whatsapp_crm_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  kind text not null check (kind in ('checkin_confirmation','review_request')),
  status text not null check (status in ('opened','sent','confirmed','replied')),
  phone text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create index if not exists whatsapp_crm_events_company_reservation_idx
  on public.whatsapp_crm_events(company_id, reservation_id, occurred_at desc);
create index if not exists whatsapp_crm_events_company_kind_idx
  on public.whatsapp_crm_events(company_id, kind, occurred_at desc);

alter table public.whatsapp_crm_events enable row level security;

drop policy if exists whatsapp_crm_events_select_member on public.whatsapp_crm_events;
create policy whatsapp_crm_events_select_member
on public.whatsapp_crm_events for select
to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = whatsapp_crm_events.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
  )
);

drop policy if exists whatsapp_crm_events_insert_member on public.whatsapp_crm_events;
create policy whatsapp_crm_events_insert_member
on public.whatsapp_crm_events for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.company_members cm
    where cm.company_id = whatsapp_crm_events.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
  )
);

drop policy if exists whatsapp_crm_events_update_member on public.whatsapp_crm_events;
create policy whatsapp_crm_events_update_member
on public.whatsapp_crm_events for update
to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = whatsapp_crm_events.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
  )
)
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = whatsapp_crm_events.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
  )
);
