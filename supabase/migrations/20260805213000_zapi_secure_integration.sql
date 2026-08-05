create table if not exists public.zapi_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  instance_id text not null,
  instance_token_encrypted text not null,
  client_token_encrypted text not null,
  phone_number text,
  connected boolean not null default false,
  smartphone_connected boolean not null default false,
  last_status text,
  webhook_configured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zapi_integrations enable row level security;

create index if not exists idx_zapi_integrations_company_id
  on public.zapi_integrations(company_id);

comment on table public.zapi_integrations is
  'Credenciais Z-API cifradas e acessíveis somente por Edge Functions com service role.';
comment on column public.zapi_integrations.instance_token_encrypted is
  'Token cifrado no servidor; nunca deve ser retornado ao navegador.';
comment on column public.zapi_integrations.client_token_encrypted is
  'Client Token cifrado no servidor; nunca deve ser retornado ao navegador.';
