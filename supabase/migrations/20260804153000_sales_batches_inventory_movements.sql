-- Compras com vários itens, compradores sem quarto e auditoria completa de estoque.
-- A migração é aditiva: não remove vendas, hóspedes, reservas, pagamentos ou histórico.

alter table public.products
  add column if not exists estoque_total_recebido integer not null default 0,
  add column if not exists custo_unitario numeric not null default 0,
  add column if not exists updated_at timestamptz not null default now();

update public.products
set estoque_total_recebido = greatest(estoque_total_recebido, estoque_atual)
where estoque_total_recebido < estoque_atual;

alter table public.sales
  add column if not exists compra_id uuid,
  add column if not exists comprador_tipo text not null default 'hospede',
  add column if not exists comprador_nome text,
  add column if not exists cliente_id uuid references public.clients(id) on delete set null;

update public.sales
set compra_id = coalesce(compra_id, gen_random_uuid()),
    comprador_tipo = coalesce(comprador_tipo, 'hospede')
where compra_id is null or comprador_tipo is null;

alter table public.sales alter column compra_id set default gen_random_uuid();
alter table public.sales alter column compra_id set not null;
alter table public.sales alter column quarto drop not null;

alter table public.sales drop constraint if exists sales_comprador_tipo_check;
alter table public.sales
  add constraint sales_comprador_tipo_check
  check (comprador_tipo in ('hospede', 'funcionario'));

create index if not exists sales_company_compra_idx
  on public.sales (company_id, compra_id, created_at desc);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  produto_id uuid not null references public.products(id) on delete cascade,
  tipo text not null,
  quantidade integer not null,
  estoque_anterior integer not null,
  estoque_posterior integer not null,
  custo_unitario numeric not null default 0,
  motivo text,
  sale_id uuid references public.sales(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint stock_movements_tipo_check
    check (tipo in ('estoque_inicial', 'reposicao', 'venda', 'ajuste_positivo', 'ajuste_negativo'))
);

create index if not exists stock_movements_company_product_date_idx
  on public.stock_movements (company_id, produto_id, created_at desc);

alter table public.stock_movements enable row level security;

drop policy if exists stock_movements_company_select on public.stock_movements;
create policy stock_movements_company_select on public.stock_movements
for select to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists stock_movements_company_insert on public.stock_movements;
create policy stock_movements_company_insert on public.stock_movements
for insert to authenticated
with check (public.is_company_member(company_id, (select auth.uid())));

grant select, insert on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;

create or replace function public.register_stock_restock(
  _company_id uuid,
  _product_id uuid,
  _quantity integer,
  _unit_cost numeric default null,
  _reason text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  previous_stock integer;
  new_stock integer;
  effective_cost numeric;
begin
  if _quantity <= 0 then
    raise exception 'A quantidade da reposição deve ser maior que zero';
  end if;

  select estoque_atual, custo_unitario
    into previous_stock, effective_cost
  from public.products
  where id = _product_id and company_id = _company_id
  for update;

  if not found then
    raise exception 'Produto não encontrado para esta empresa';
  end if;

  effective_cost := coalesce(_unit_cost, effective_cost, 0);
  new_stock := previous_stock + _quantity;

  update public.products
  set estoque_atual = new_stock,
      estoque_total_recebido = estoque_total_recebido + _quantity,
      custo_unitario = effective_cost,
      updated_at = now()
  where id = _product_id and company_id = _company_id;

  insert into public.stock_movements (
    company_id, produto_id, tipo, quantidade, estoque_anterior,
    estoque_posterior, custo_unitario, motivo
  ) values (
    _company_id, _product_id, 'reposicao', _quantity, previous_stock,
    new_stock, effective_cost, nullif(trim(_reason), '')
  );

  return new_stock;
end;
$$;

create or replace function public.register_stock_count(
  _company_id uuid,
  _product_id uuid,
  _counted_quantity integer,
  _reason text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  previous_stock integer;
  difference integer;
  movement_type text;
  product_cost numeric;
begin
  if _counted_quantity < 0 then
    raise exception 'A quantidade contada não pode ser negativa';
  end if;

  select estoque_atual, custo_unitario
    into previous_stock, product_cost
  from public.products
  where id = _product_id and company_id = _company_id
  for update;

  if not found then
    raise exception 'Produto não encontrado para esta empresa';
  end if;

  difference := _counted_quantity - previous_stock;
  if difference = 0 then
    return previous_stock;
  end if;

  movement_type := case when difference > 0 then 'ajuste_positivo' else 'ajuste_negativo' end;

  update public.products
  set estoque_atual = _counted_quantity,
      estoque_total_recebido = case
        when difference > 0 then estoque_total_recebido + difference
        else estoque_total_recebido
      end,
      updated_at = now()
  where id = _product_id and company_id = _company_id;

  insert into public.stock_movements (
    company_id, produto_id, tipo, quantidade, estoque_anterior,
    estoque_posterior, custo_unitario, motivo
  ) values (
    _company_id, _product_id, movement_type, abs(difference), previous_stock,
    _counted_quantity, coalesce(product_cost, 0),
    coalesce(nullif(trim(_reason), ''), 'Contagem física de estoque')
  );

  return _counted_quantity;
end;
$$;

grant execute on function public.register_stock_restock(uuid, uuid, integer, numeric, text)
  to authenticated, service_role;
grant execute on function public.register_stock_count(uuid, uuid, integer, text)
  to authenticated, service_role;

create or replace function public.decrement_product_stock_on_sale()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  previous_stock integer;
  new_stock integer;
  product_cost numeric;
begin
  if new.produto_id is null or greatest(new.qtd, 0) = 0 then
    return new;
  end if;

  select estoque_atual, custo_unitario
    into previous_stock, product_cost
  from public.products
  where id = new.produto_id and company_id = new.company_id
  for update;

  if not found then
    raise exception 'Produto não encontrado para esta empresa';
  end if;

  if previous_stock < greatest(new.qtd, 0) then
    raise exception 'Estoque insuficiente para %', new.item;
  end if;

  new_stock := previous_stock - greatest(new.qtd, 0);

  update public.products
  set estoque_atual = new_stock,
      updated_at = now()
  where id = new.produto_id and company_id = new.company_id;

  insert into public.stock_movements (
    company_id, produto_id, tipo, quantidade, estoque_anterior,
    estoque_posterior, custo_unitario, motivo, sale_id
  ) values (
    new.company_id, new.produto_id, 'venda', greatest(new.qtd, 0), previous_stock,
    new_stock, coalesce(product_cost, 0),
    coalesce(new.comprador_nome, new.item), new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_decrement_product_stock_on_sale on public.sales;
create trigger trg_decrement_product_stock_on_sale
after insert on public.sales
for each row execute function public.decrement_product_stock_on_sale();

-- Registra o saldo já existente como base de auditoria, sem duplicar registros.
insert into public.stock_movements (
  company_id, produto_id, tipo, quantidade, estoque_anterior,
  estoque_posterior, custo_unitario, motivo
)
select p.company_id, p.id, 'estoque_inicial', p.estoque_atual, 0,
       p.estoque_atual, coalesce(p.custo_unitario, 0), 'Saldo existente antes do controle de movimentos'
from public.products p
where p.estoque_atual > 0
  and not exists (
    select 1 from public.stock_movements sm
    where sm.company_id = p.company_id and sm.produto_id = p.id
  );
