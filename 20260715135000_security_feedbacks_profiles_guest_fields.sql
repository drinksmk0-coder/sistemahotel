-- External reservation integrations: WhatsApp/WAHA and channel-manager style payloads.
-- The Edge Function writes with the service role; authenticated staff can inspect logs.

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error text,
  reservation_id uuid references public.reservations(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists integration_events_source_external_id_unique
on public.integration_events (source, external_id)
where external_id is not null;

alter table public.integration_events enable row level security;

drop policy if exists integration_events_staff_select on public.integration_events;
create policy integration_events_staff_select on public.integration_events
for select
to authenticated
using (public.is_staff((select auth.uid())));

grant select on public.integration_events to authenticated;
grant all on public.integration_events to service_role;

create table if not exists public.whatsapp_reservation_sessions (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  chat_id text,
  stage text not null default 'idle',
  draft jsonb not null default '{}'::jsonb,
  last_message text,
  last_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_reservation_sessions enable row level security;

drop policy if exists whatsapp_reservation_sessions_staff_select on public.whatsapp_reservation_sessions;
create policy whatsapp_reservation_sessions_staff_select on public.whatsapp_reservation_sessions
for select
to authenticated
using (public.is_staff((select auth.uid())));

grant select on public.whatsapp_reservation_sessions to authenticated;
grant all on public.whatsapp_reservation_sessions to service_role;

drop trigger if exists whatsapp_reservation_sessions_updated_at on public.whatsapp_reservation_sessions;
create trigger whatsapp_reservation_sessions_updated_at
before update on public.whatsapp_reservation_sessions
for each row execute function public.update_updated_at_column();

create or replace function public.reservation_has_overlap(
  _quarto integer,
  _checkin date,
  _checkout date,
  _exclude_id uuid default null
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.reservations r
    where r.quarto = _quarto
      and (_exclude_id is null or r.id <> _exclude_id)
      and r.status not in ('cancelado', 'finalizado', 'manutencao')
      and _checkin < r.checkout::date
      and _checkout > r.checkin::date
  );
$$;

grant execute on function public.reservation_has_overlap(integer, date, date, uuid) to authenticated, service_role;
