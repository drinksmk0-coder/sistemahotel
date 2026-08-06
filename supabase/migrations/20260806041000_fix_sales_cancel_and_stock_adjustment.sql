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

create or replace function public.standardize_sale_fields()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  keep_cancelled boolean := lower(trim(coalesce(new.status, ''))) = 'cancelado';
begin
  new.pagamento := case
    when lower(unaccent(coalesce(new.pagamento,''))) like '%pix%' then 'Pix'
    when lower(unaccent(coalesce(new.pagamento,''))) like '%credito%' then 'Cartão de Crédito'
    when lower(unaccent(coalesce(new.pagamento,''))) like '%debito%' then 'Cartão de Débito'
    when lower(unaccent(coalesce(new.pagamento,''))) like '%dinheiro%'
      or lower(unaccent(coalesce(new.pagamento,''))) like '%especie%' then 'Dinheiro'
    when lower(unaccent(coalesce(new.pagamento,''))) like '%boleto%' then 'Boleto Bancário'
    when lower(unaccent(coalesce(new.pagamento,''))) like '%transfer%' then 'Transferência'
    when trim(coalesce(new.pagamento,'')) = '' then 'Não informado'
    else initcap(lower(trim(new.pagamento)))
  end;

  new.categoria := case
    when trim(coalesce(new.categoria,'')) = '' then 'Outros'
    when lower(unaccent(new.categoria)) like '%agua%' then 'Bebidas'
    when lower(unaccent(new.categoria)) like '%bebida%' then 'Bebidas'
    when lower(unaccent(new.categoria)) like '%lavander%' then 'Lavanderia'
    when lower(unaccent(new.categoria)) like '%aliment%' then 'Alimentação'
    when lower(unaccent(new.categoria)) like '%servic%' then 'Serviços'
    else initcap(lower(trim(new.categoria)))
  end;

  new.item := trim(regexp_replace(coalesce(new.item, new.categoria, 'Venda extra'), '\s+', ' ', 'g'));
  new.qtd := greatest(1, coalesce(new.qtd, 1));
  new.total := greatest(0, coalesce(new.total, 0));
  new.valor_unit := case
    when coalesce(new.valor_unit, 0) > 0 then new.valor_unit
    else round(new.total / greatest(new.qtd, 1), 2)
  end;

  if keep_cancelled then
    new.valor_pago := 0;
    new.status := 'cancelado';
  else
    new.valor_pago := least(new.total, greatest(0, coalesce(new.valor_pago, 0)));
    new.status := case
      when new.valor_pago >= new.total and new.total > 0 then 'pago'
      when new.valor_pago > 0 then 'parcial'
      else 'pendente'
    end;
  end if;

  return new;
end;
$$;

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
      and coalesce(s.status, '') <> 'cancelado'
    for update
  loop
    processed := processed + 1;

    if sale_row.produto_id is not null and coalesce(sale_row.qtd, 0) > 0 then
      select estoque_atual into previous_stock
      from public.products
      where id = sale_row.produto_id and company_id = _company_id
      for update;

      if found then
        restored_stock := previous_stock + sale_row.qtd;
        update public.products
        set estoque_atual = restored_stock,
            updated_at = now()
        where id = sale_row.produto_id and company_id = _company_id;

        insert into public.stock_movements(
          company_id, produto_id, tipo, quantidade,
          estoque_anterior, estoque_posterior, motivo, created_by
        ) values (
          _company_id, sale_row.produto_id, 'cancelamento_venda', sale_row.qtd,
          previous_stock, restored_stock,
          'Cancelamento da comanda ' || coalesce(sale_row.compra_id::text, sale_row.id::text),
          auth.uid()
        );
      end if;
    end if;

    update public.sales
    set status = 'cancelado',
        valor_pago = 0
    where id = sale_row.id and company_id = _company_id;
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