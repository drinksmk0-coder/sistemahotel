-- CRM comercial Hotel Real: executar no projeto Supabase do PMS antes de usar a tela.
-- Não altera reservas, pagamentos ou integrações existentes.
create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_name text not null,
  phone text not null,
  stage text not null default 'novo' check (stage in ('novo','orcamento','aguardando','negociando','ganho','perdido')),
  source text not null default 'whatsapp',
  expected_value numeric(12,2) not null default 0 check (expected_value >= 0),
  realized_value numeric(12,2) not null default 0 check (realized_value >= 0),
  checkin date,
  checkout date,
  next_followup_at timestamptz,
  last_contact_at timestamptz,
  consent_status text not null default 'desconhecido' check (consent_status in ('desconhecido','autorizado','recusado')),
  notes text not null default '',
  lost_reason text,
  reservation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_dates_valid check (checkout is null or checkin is null or checkout > checkin)
);
create index if not exists crm_opportunities_company_followup_idx
  on public.crm_opportunities(company_id, next_followup_at)
  where stage not in ('ganho','perdido');
create index if not exists crm_opportunities_company_stage_idx
  on public.crm_opportunities(company_id, stage);
create index if not exists crm_opportunities_company_phone_idx
  on public.crm_opportunities(company_id, phone);
alter table public.crm_opportunities enable row level security;
drop policy if exists crm_select on public.crm_opportunities;
drop policy if exists crm_insert on public.crm_opportunities;
drop policy if exists crm_update on public.crm_opportunities;
drop policy if exists crm_delete on public.crm_opportunities;
create policy crm_select on public.crm_opportunities for select to authenticated using (
  exists (select 1 from public.company_members m where m.company_id = crm_opportunities.company_id and m.user_id = auth.uid() and m.ativo = true and m.role in ('dono','recepcao'))
);
create policy crm_insert on public.crm_opportunities for insert to authenticated with check (
  exists (select 1 from public.company_members m where m.company_id = crm_opportunities.company_id and m.user_id = auth.uid() and m.ativo = true and m.role in ('dono','recepcao'))
);
create policy crm_update on public.crm_opportunities for update to authenticated using (
  exists (select 1 from public.company_members m where m.company_id = crm_opportunities.company_id and m.user_id = auth.uid() and m.ativo = true and m.role in ('dono','recepcao'))
) with check (
  exists (select 1 from public.company_members m where m.company_id = crm_opportunities.company_id and m.user_id = auth.uid() and m.ativo = true and m.role in ('dono','recepcao'))
);
create policy crm_delete on public.crm_opportunities for delete to authenticated using (
  exists (select 1 from public.company_members m where m.company_id = crm_opportunities.company_id and m.user_id = auth.uid() and m.ativo = true and m.role = 'dono')
);
create or replace function public.crm_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_crm_touch on public.crm_opportunities;
create trigger trg_crm_touch before update on public.crm_opportunities
for each row execute function public.crm_touch_updated_at();

comment on table public.crm_opportunities is 'Funil de receita: oportunidades, acompanhamento e conversao. WhatsApp depende de API oficial e consentimento.';
