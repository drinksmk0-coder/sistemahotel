create table if not exists public.booking_browser_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  booking_code text not null,
  source text not null default 'booking_extranet_chrome',
  status text not null default 'needs_review' check (status in ('needs_review','approved','rejected','processed')),
  event_type text not null default 'reservation_details',
  guest_name text,
  checkin_text text,
  checkout_text text,
  total_text text,
  guests_text text,
  room_type text,
  booking_status_text text,
  page_url text,
  page_title text,
  payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (company_id, booking_code, event_type)
);

create index if not exists booking_browser_events_company_status_idx
  on public.booking_browser_events(company_id, status, created_at desc);

alter table public.booking_browser_events enable row level security;

create policy "company members can read booking browser events"
on public.booking_browser_events for select
to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = booking_browser_events.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
  )
);

create policy "owners and admins can review booking browser events"
on public.booking_browser_events for update
to authenticated
using (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = booking_browser_events.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
      and cm.role in ('owner','admin','proprietario')
  )
)
with check (
  exists (
    select 1 from public.company_members cm
    where cm.company_id = booking_browser_events.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
      and cm.role in ('owner','admin','proprietario')
  )
);
