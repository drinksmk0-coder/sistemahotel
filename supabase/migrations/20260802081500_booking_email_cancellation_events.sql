-- Auditoria mínima e idempotente dos avisos de cancelamento recebidos por e-mail.
-- Não armazena o corpo completo da mensagem nem dados de cartão.
create table if not exists public.booking_email_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gmail_message_id text not null,
  booking_code text not null,
  hotel_id text,
  event_type text not null default 'cancellation'
    check (event_type in ('cancellation')),
  sender text,
  subject text,
  received_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'already_cancelled', 'needs_review', 'ignored', 'error')),
  reservation_id uuid references public.reservations(id) on delete set null,
  previous_status text,
  new_status text,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, gmail_message_id)
);

create index if not exists booking_email_events_company_status_created_idx
  on public.booking_email_events (company_id, status, created_at desc);

alter table public.booking_email_events enable row level security;

comment on table public.booking_email_events is
  'Auditoria técnica de avisos da Booking recebidos por Gmail. Escrita exclusiva por Edge Function com service role.';
