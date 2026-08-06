begin;

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  produto_id uuid not null references public.products(id) on delete cascade,
  tipo text not null,
  quantidade integer not null,
  estoque_anterior integer not null,
  estoque_posterior integer not null,
  custo_unitario numeric,
  motivo text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_company_created
  on public.stock_movements(company_id, created_at desc);
create index if not exists idx_stock_movements_product_created
  on public.stock_movements(produto_id, created_at desc);

alter table public.stock_movements enable row level security;
grant select, insert on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select
on public.stock_movements
for select
to authenticated
using (public.is_company_member(company_id, auth.uid()));

drop policy if exists stock_movements_insert on public.stock_movements;
create policy stock_movements_insert
on public.stock_movements
for insert
to authenticated
with check (public.is_company_member(company_id, auth.uid()));

create or replace function public.restore_product_stock_after_sale_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.produto_id is not null and coalesce(old.qtd, 0) > 0 then
    update public.products
    set estoque_atual = coalesce(estoque_atual, 0) + old.qtd,
        updated_at = now()
    where id = old.produto_id
      and company_id = old.company_id;
  end if;
  return old;
end;
$$;

revoke all on function public.restore_product_stock_after_sale_delete() from public, anon, authenticated;

drop trigger if exists trg_restore_product_stock_on_sale_delete on public.sales;
drop trigger if exists trg_restore_product_stock_after_sale_delete on public.sales;
create trigger trg_restore_product_stock_after_sale_delete
after delete on public.sales
for each row execute function public.restore_product_stock_after_sale_delete();

create or replace function public.register_stock_count(
  _company_id uuid,
  _product_id uuid,
  _counted_quantity numeric,
  _reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  counted integer;
begin
  if auth.uid() is null or not public.is_company_member(_company_id, auth.uid()) then
    raise exception 'Sem permissão para alterar o estoque desta empresa';
  end if;

  counted := round(coalesce(_counted_quantity, 0))::integer;
  if counted < 0 then
    raise exception 'A contagem não pode ser negativa';
  end if;

  select * into product_row
  from public.products
  where id = _product_id and company_id = _company_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  update public.products
  set estoque_atual = counted,
      updated_at = now()
  where id = _product_id and company_id = _company_id;

  if counted <> product_row.estoque_atual then
    insert into public.stock_movements(
      company_id, produto_id, tipo, quantidade,
      estoque_anterior, estoque_posterior, motivo, created_by
    ) values (
      _company_id, _product_id,
      case when counted > product_row.estoque_atual then 'ajuste_positivo' else 'ajuste_negativo' end,
      counted - product_row.estoque_atual,
      product_row.estoque_atual,
      counted,
      nullif(trim(coalesce(_reason, '')), ''),
      auth.uid()
    );
  end if;
end;
$$;

create or replace function public.register_stock_restock(
  _company_id uuid,
  _product_id uuid,
  _quantity numeric,
  _unit_cost numeric,
  _reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  received integer;
  new_stock integer;
begin
  if auth.uid() is null or not public.is_company_member(_company_id, auth.uid()) then
    raise exception 'Sem permissão para alterar o estoque desta empresa';
  end if;

  received := round(coalesce(_quantity, 0))::integer;
  if received <= 0 then
    raise exception 'A quantidade de reposição deve ser maior que zero';
  end if;

  select * into product_row
  from public.products
  where id = _product_id and company_id = _company_id
  for update;

  if not found then
    raise exception 'Produto não encontrado';
  end if;

  new_stock := product_row.estoque_atual + received;

  update public.products
  set estoque_atual = new_stock,
      estoque_total_recebido = coalesce(estoque_total_recebido, 0) + received,
      custo_unitario = coalesce(_unit_cost, custo_unitario, 0),
      updated_at = now()
  where id = _product_id and company_id = _company_id;

  insert into public.stock_movements(
    company_id, produto_id, tipo, quantidade,
    estoque_anterior, estoque_posterior, custo_unitario, motivo, created_by
  ) values (
    _company_id, _product_id, 'reposicao', received,
    product_row.estoque_atual, new_stock, _unit_cost,
    nullif(trim(coalesce(_reason, '')), ''), auth.uid()
  );
end;
$$;

create or replace function public.cancel_sale_group(
  _company_id uuid,
  _sale_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale_row record;
  previous_stock integer;
  restored_stock integer;
  processed integer := 0;
begin
  if auth.uid() is null or not public.is_company_member(_company_id, auth.uid()) then
    raise exception 'Acesso negado';
  end if;

  if coalesce(array_length(_sale_ids, 1), 0) = 0 then
    raise exception 'Nenhuma venda foi informada';
  end if;

  for sale_row in
    select s.id, s.produto_id, s.qtd, s.compra_id
    from public.sales s
    where s.company_id = _company_id
      and s.id = any(_sale_ids)
    for update
  loop
    processed := processed + 1;
    previous_stock := null;

    if sale_row.produto_id is not null and coalesce(sale_row.qtd, 0) > 0 then
      select estoque_atual into previous_stock
      from public.products
      where id = sale_row.produto_id and company_id = _company_id;
    end if;

    delete from public.sales
    where id = sale_row.id and company_id = _company_id;

    if previous_stock is not null then
      select estoque_atual into restored_stock
      from public.products
      where id = sale_row.produto_id and company_id = _company_id;

      insert into public.stock_movements(
        company_id, produto_id, tipo, quantidade,
        estoque_anterior, estoque_posterior, motivo, created_by
      ) values (
        _company_id, sale_row.produto_id, 'exclusao_venda', sale_row.qtd,
        previous_stock, restored_stock,
        'Venda excluída definitivamente: ' || coalesce(sale_row.compra_id::text, sale_row.id::text),
        auth.uid()
      );
    end if;
  end loop;

  if processed = 0 then
    raise exception 'Comanda não encontrada ou já excluída';
  end if;
end;
$$;

revoke all on function public.register_stock_count(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.register_stock_count(uuid, uuid, numeric, text) to authenticated, service_role;

revoke all on function public.register_stock_restock(uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.register_stock_restock(uuid, uuid, numeric, numeric, text) to authenticated, service_role;

revoke all on function public.cancel_sale_group(uuid, uuid[]) from public, anon;
grant execute on function public.cancel_sale_group(uuid, uuid[]) to authenticated, service_role;

commit;