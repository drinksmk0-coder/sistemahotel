drop policy if exists sales_delete_company_staff on public.sales;
drop policy if exists sales_owner_reception_delete on public.sales;
create policy sales_owner_delete on public.sales
for delete to authenticated
using (public.has_company_role(company_id, auth.uid(), 'dono'::public.app_role));

drop policy if exists reservations_owner_reception_delete on public.reservations;
create policy reservations_owner_delete on public.reservations
for delete to authenticated
using (public.has_company_role(company_id, auth.uid(), 'dono'::public.app_role));

drop policy if exists guest_checkins_owner_reception_delete on public.guest_checkins;
create policy guest_checkins_owner_delete on public.guest_checkins
for delete to authenticated
using (public.has_company_role(company_id, auth.uid(), 'dono'::public.app_role));

create or replace function public.enforce_reception_sales_update_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_is_owner boolean := false;
  v_is_reception boolean := false;
begin
  if v_user is null then return new; end if;
  v_is_owner := public.has_company_role(old.company_id, v_user, 'dono'::public.app_role);
  if v_is_owner then return new; end if;
  v_is_reception := public.has_company_role(old.company_id, v_user, 'recepcao'::public.app_role);
  if not v_is_reception then return new; end if;

  if new.company_id is distinct from old.company_id
     or new.id is distinct from old.id
     or new.reserva_id is distinct from old.reserva_id
     or new.item is distinct from old.item
     or new.qtd is distinct from old.qtd
     or new.pagamento is distinct from old.pagamento
     or new.data is distinct from old.data
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.produto_id is distinct from old.produto_id
     or new.categoria is distinct from old.categoria
     or new.valor_pago is distinct from old.valor_pago
     or new.status is distinct from old.status
     or new.observacoes is distinct from old.observacoes
     or new.cliente_id is distinct from old.cliente_id
     or new.import_source is distinct from old.import_source
     or new.external_code is distinct from old.external_code
     or new.import_identity is distinct from old.import_identity
     or new.compra_id is distinct from old.compra_id
     or new.comprador_tipo is distinct from old.comprador_tipo
     or new.comprador_nome is distinct from old.comprador_nome then
    raise exception 'Recepção pode corrigir somente quarto e valor da venda';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_reception_sales_update_scope on public.sales;
create trigger trg_enforce_reception_sales_update_scope
before update on public.sales
for each row execute function public.enforce_reception_sales_update_scope();

create or replace function public.cancel_sale_group(_company_id uuid, _sale_ids uuid[])
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
  if auth.uid() is null or not public.has_company_role(_company_id, auth.uid(), 'dono'::public.app_role) then
    raise exception 'Apenas o proprietário pode excluir vendas';
  end if;
  if coalesce(array_length(_sale_ids, 1), 0) = 0 then raise exception 'Nenhuma venda foi informada'; end if;

  for sale_row in
    select s.id, s.produto_id, s.qtd, s.compra_id
    from public.sales s
    where s.company_id = _company_id and s.id = any(_sale_ids)
    for update
  loop
    processed := processed + 1;
    previous_stock := null;
    if sale_row.produto_id is not null and coalesce(sale_row.qtd, 0) > 0 then
      select estoque_atual into previous_stock from public.products where id = sale_row.produto_id and company_id = _company_id;
    end if;
    delete from public.sales where id = sale_row.id and company_id = _company_id;
    if previous_stock is not null then
      select estoque_atual into restored_stock from public.products where id = sale_row.produto_id and company_id = _company_id;
      insert into public.stock_movements(company_id, produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, created_by)
      values (_company_id, sale_row.produto_id, 'exclusao_venda', sale_row.qtd, previous_stock, restored_stock,
              'Venda excluída definitivamente: ' || coalesce(sale_row.compra_id::text, sale_row.id::text), auth.uid());
    end if;
  end loop;
  if processed = 0 then raise exception 'Comanda não encontrada ou já excluída'; end if;
end;
$$;

create or replace function public.delete_sales_bulk(p_company_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user is null then raise exception 'Usuário não autenticado'; end if;
  if not public.has_company_role(p_company_id, v_user, 'dono'::public.app_role) then
    raise exception 'Apenas o proprietário pode excluir vendas';
  end if;
  delete from public.sales where company_id = p_company_id and id = any(p_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;