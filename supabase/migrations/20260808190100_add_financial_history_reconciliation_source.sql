create table if not exists public.analytics_financial_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  transaction_date date not null,
  transaction_type text not null check (transaction_type in ('receita','despesa')),
  status text not null,
  original_category text,
  normalized_category text not null,
  description text not null,
  amount numeric not null check (amount >= 0),
  payment_method text,
  external_code text,
  room_number integer,
  linked_reservation_id uuid references public.reservations(id) on delete set null,
  match_status text not null default 'unmatched' check (match_status in ('linked','already_accounted','duplicate_source','ambiguous','unmatched','expense_imported')),
  operating_impact boolean not null default true,
  source_file text not null,
  import_identity text not null,
  notes text,
  imported_at timestamptz not null default now(),
  unique(company_id, import_identity)
);

create index if not exists analytics_financial_history_company_date_idx
  on public.analytics_financial_history(company_id, transaction_date);
create index if not exists analytics_financial_history_company_type_idx
  on public.analytics_financial_history(company_id, transaction_type, normalized_category);
create index if not exists analytics_financial_history_reservation_idx
  on public.analytics_financial_history(linked_reservation_id)
  where linked_reservation_id is not null;

alter table public.analytics_financial_history enable row level security;
revoke all on public.analytics_financial_history from anon, authenticated;
grant select, insert, update, delete on public.analytics_financial_history to service_role;