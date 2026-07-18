create table if not exists public.kitchen_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  categoria text not null default 'Café da manhã',
  unidade text not null default 'un',
  estoque_atual numeric not null default 0,
  estoque_minimo numeric not null default 0,
  consumo_por_pessoa numeric not null default 0,
  ativo boolean not null default true,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (estoque_atual >= 0),
  check (estoque_minimo >= 0),
  check (consumo_por_pessoa >= 0)
);

create table if not exists public.kitchen_productions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id uuid not null references public.kitchen_items(id) on delete cascade,
  data date not null default current_date,
  turno text not null default 'cafe',
  produzido numeric not null default 0,
  servido numeric not null default 0,
  sobra numeric not null default 0,
  perda numeric not null default 0,
  pessoas_servidas integer not null default 0,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (produzido >= 0),
  check (servido >= 0),
  check (sobra >= 0),
  check (perda >= 0),
  check (pessoas_servidas >= 0)
);

create unique index if not exists kitchen_items_company_nome_unique
on public.kitchen_items (company_id, lower(nome));

create index if not exists kitchen_items_company_idx
on public.kitchen_items (company_id, ativo, categoria);

create index if not exists kitchen_productions_company_date_idx
on public.kitchen_productions (company_id, data desc);

create index if not exists kitchen_productions_item_date_idx
on public.kitchen_productions (item_id, data desc);

drop trigger if exists kitchen_items_updated_at on public.kitchen_items;
create trigger kitchen_items_updated_at before update on public.kitchen_items
for each row execute function public.update_updated_at_column();

drop trigger if exists kitchen_productions_updated_at on public.kitchen_productions;
create trigger kitchen_productions_updated_at before update on public.kitchen_productions
for each row execute function public.update_updated_at_column();

alter table public.kitchen_items enable row level security;
alter table public.kitchen_productions enable row level security;

drop policy if exists kitchen_items_cafe_all on public.kitchen_items;
create policy kitchen_items_cafe_all on public.kitchen_items
for all to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);

drop policy if exists kitchen_productions_cafe_all on public.kitchen_productions;
create policy kitchen_productions_cafe_all on public.kitchen_productions
for all to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'cafe')
);

grant select, insert, update, delete on public.kitchen_items to authenticated;
grant select, insert, update, delete on public.kitchen_productions to authenticated;
grant all on public.kitchen_items, public.kitchen_productions to service_role;
