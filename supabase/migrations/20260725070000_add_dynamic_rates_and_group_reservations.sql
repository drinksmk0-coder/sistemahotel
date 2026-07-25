create table if not exists public.rate_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  inicio date not null,
  fim date not null,
  configuracao_quarto text,
  valor_base numeric(12, 2) not null check (valor_base >= 0),
  hospedes_inclusos integer not null default 1 check (hospedes_inclusos > 0),
  adicional_hospede numeric(12, 2) not null default 0 check (adicional_hospede >= 0),
  minimo_diarias integer not null default 1 check (minimo_diarias > 0),
  prioridade integer not null default 0,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rate_rules_periodo_valido check (fim >= inicio)
);

create table if not exists public.reservation_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  responsavel_nome text not null,
  responsavel_telefone text,
  checkin date not null,
  checkout date not null,
  canal text,
  observacoes text,
  status text not null default 'ativo'
    check (status in ('ativo', 'finalizado', 'cancelado')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_groups_periodo_valido check (checkout > checkin)
);

alter table public.reservations
  add column if not exists group_id uuid
  references public.reservation_groups(id) on delete set null;

create index if not exists rate_rules_company_period_idx
  on public.rate_rules (company_id, ativo, inicio, fim, prioridade desc);

create index if not exists reservation_groups_company_created_idx
  on public.reservation_groups (company_id, created_at desc);

create index if not exists reservations_group_id_idx
  on public.reservations (group_id)
  where group_id is not null;

alter table public.rate_rules enable row level security;
alter table public.reservation_groups enable row level security;

drop policy if exists rate_rules_company_select on public.rate_rules;
create policy rate_rules_company_select
on public.rate_rules
for select
to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists rate_rules_owner_write on public.rate_rules;
create policy rate_rules_owner_write
on public.rate_rules
for all
to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role))
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

drop policy if exists reservation_groups_company_all on public.reservation_groups;
create policy reservation_groups_company_all
on public.reservation_groups
for all
to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

grant select, insert, update, delete on public.rate_rules to authenticated;
grant select, insert, update, delete on public.reservation_groups to authenticated;

drop trigger if exists rate_rules_updated_at on public.rate_rules;
create trigger rate_rules_updated_at
before update on public.rate_rules
for each row execute function public.update_updated_at_column();

drop trigger if exists reservation_groups_updated_at on public.reservation_groups;
create trigger reservation_groups_updated_at
before update on public.reservation_groups
for each row execute function public.update_updated_at_column();
