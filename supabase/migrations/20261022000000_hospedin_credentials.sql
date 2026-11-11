-- Store Hospedin credentials encrypted; only the server function can access this table.
create table if not exists public.hospedin_credentials (
  company_id uuid primary key references public.companies(id) on delete cascade,
  client_id text not null,
  encrypted_client_secret text not null,
  secret_iv text not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hospedin_credentials enable row level security;
revoke all on public.hospedin_credentials from anon, authenticated;
grant all on public.hospedin_credentials to service_role;

comment on table public.hospedin_credentials is
  'Hospedin credentials encrypted by the hospedin-credentials Edge Function. Never expose this table through the client Data API.';
