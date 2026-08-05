begin;

alter table public.products
  add column if not exists unidade text not null default 'unidade',
  add column if not exists custo_unitario numeric not null default 0,
  add column if not exists estoque_total_recebido numeric not null default 0;

alter table public.sales
  add column if not exists compra_id uuid,
  add column if not exists comprador_tipo text,
  add column if not exists comprador_nome text,
  add column if not exists valor_pago numeric not null default 0,
  add column if not exists status text not null default 'pendente';

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  produto_id uuid not null references public.products(id) on delete cascade,
  tipo text not null,
  quantidade numeric not null,
  estoque_anterior numeric not null,
  estoque_posterior numeric not null,
  custo_unitario numeric,
  motivo text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.stock_movements enable row level security;
grant select, insert on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated
using (public.is_company_member(auth.uid(), company_id));

drop policy if exists stock_movements_insert on public.stock_movements;
create policy stock_movements_insert on public.stock_movements for insert to authenticated
with check (public.is_company_member(auth.uid(), company_id));

create or replace function public.register_stock_restock(
  _company_id uuid,
  _product_id uuid,
  _quantity numeric,
  _unit_cost numeric,
  _reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.products%rowtype;
  new_stock numeric;
begin
  if not public.is_company_member(auth.uid(), _company_id) then
    raise exception 'Sem permissão para alterar o estoque desta empresa';
  end if;
  if coalesce(_quantity,0) <= 0 then
    raise exception 'A quantidade de reposição deve ser maior que zero';
  end if;
  select * into p from public.products
    where id = _product_id and company_id = _company_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  new_stock := p.estoque_atual + _quantity;
  update public.products
    set estoque_atual = new_stock,
        estoque_total_recebido = coalesce(estoque_total_recebido,0) + _quantity,
        custo_unitario = coalesce(_unit_cost, custo_unitario, 0),
        updated_at = now()
    where id = _product_id;
  insert into public.stock_movements(company_id, produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, custo_unitario, motivo, created_by)
  values(_company_id, _product_id, 'reposicao', _quantity, p.estoque_atual, new_stock, _unit_cost, _reason, auth.uid());
end;
$$;

create or replace function public.register_stock_count(
  _company_id uuid,
  _product_id uuid,
  _counted_quantity numeric,
  _reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.products%rowtype;
begin
  if not public.is_company_member(auth.uid(), _company_id) then
    raise exception 'Sem permissão para alterar o estoque desta empresa';
  end if;
  if coalesce(_counted_quantity,0) < 0 then
    raise exception 'A contagem não pode ser negativa';
  end if;
  select * into p from public.products
    where id = _product_id and company_id = _company_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  update public.products set estoque_atual = _counted_quantity, updated_at = now() where id = _product_id;
  insert into public.stock_movements(company_id, produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, created_by)
  values(_company_id, _product_id, 'contagem', _counted_quantity - p.estoque_atual, p.estoque_atual, _counted_quantity, _reason, auth.uid());
end;
$$;

revoke all on function public.register_stock_restock(uuid,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.register_stock_restock(uuid,uuid,numeric,numeric,text) to authenticated;
revoke all on function public.register_stock_count(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.register_stock_count(uuid,uuid,numeric,text) to authenticated;

create or replace function public.apply_sale_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.products%rowtype;
  new_stock numeric;
begin
  if new.produto_id is null or new.compra_id is null then
    return new;
  end if;
  select * into p from public.products
    where id = new.produto_id and company_id = new.company_id for update;
  if not found then raise exception 'Produto não encontrado para a venda'; end if;
  if p.estoque_atual < new.qtd then
    raise exception 'Estoque insuficiente para % (disponível: %)', p.nome, p.estoque_atual;
  end if;
  new_stock := p.estoque_atual - new.qtd;
  update public.products set estoque_atual = new_stock, updated_at = now() where id = p.id;
  insert into public.stock_movements(company_id, produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, created_by)
  values(new.company_id, new.produto_id, 'venda', -new.qtd, p.estoque_atual, new_stock, 'Comanda ' || new.compra_id::text, new.created_by);
  return new;
end;
$$;

drop trigger if exists sales_apply_stock_movement on public.sales;
create trigger sales_apply_stock_movement
after insert on public.sales
for each row execute function public.apply_sale_stock_movement();

commit;
