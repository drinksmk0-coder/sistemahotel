-- Avaliações públicas passam exclusivamente pela Edge Function submit-feedback.
drop policy if exists feedbacks_public_insert on public.feedbacks;
revoke execute on function public.submit_guest_feedback(jsonb) from anon, authenticated;

-- RPC legado destrutivo não é usado pela aplicação atual.
revoke execute on function public.delete_clients_with_history(uuid, uuid[]) from authenticated;

-- Restringe operações de vendas/estoque a dono ou recepção.
create or replace function public.cancel_sale_group(_company_id uuid, _sale_ids uuid[])
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  sale_row record;
  previous_stock integer;
  restored_stock integer;
  processed integer := 0;
begin
  if auth.uid() is null or not (
    public.has_company_role(_company_id, auth.uid(), 'dono'::public.app_role)
    or public.has_company_role(_company_id, auth.uid(), 'recepcao'::public.app_role)
  ) then raise exception 'Acesso negado'; end if;
  if coalesce(array_length(_sale_ids, 1), 0) = 0 then raise exception 'Nenhuma venda foi informada'; end if;
  for sale_row in
    select s.id, s.produto_id, s.qtd, s.compra_id from public.sales s
    where s.company_id = _company_id and s.id = any(_sale_ids) for update
  loop
    processed := processed + 1;
    previous_stock := null;
    if sale_row.produto_id is not null and coalesce(sale_row.qtd, 0) > 0 then
      select estoque_atual into previous_stock from public.products where id = sale_row.produto_id and company_id = _company_id;
    end if;
    delete from public.sales where id = sale_row.id and company_id = _company_id;
    if previous_stock is not null then
      select estoque_atual into restored_stock from public.products where id = sale_row.produto_id and company_id = _company_id;
      insert into public.stock_movements(company_id,produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,motivo,created_by)
      values (_company_id,sale_row.produto_id,'exclusao_venda',sale_row.qtd,previous_stock,restored_stock,'Venda excluída definitivamente: ' || coalesce(sale_row.compra_id::text,sale_row.id::text),auth.uid());
    end if;
  end loop;
  if processed = 0 then raise exception 'Comanda não encontrada ou já excluída'; end if;
end;
$function$;

create or replace function public.register_stock_count(_company_id uuid, _product_id uuid, _counted_quantity numeric, _reason text)
returns void language plpgsql security definer set search_path to '' as $function$
declare product_row public.products%rowtype; counted integer;
begin
  if auth.uid() is null or not (
    public.has_company_role(_company_id, auth.uid(), 'dono'::public.app_role)
    or public.has_company_role(_company_id, auth.uid(), 'recepcao'::public.app_role)
  ) then raise exception 'Sem permissão para alterar o estoque desta empresa'; end if;
  counted := round(coalesce(_counted_quantity,0))::integer;
  if counted < 0 then raise exception 'A contagem não pode ser negativa'; end if;
  select * into product_row from public.products where id=_product_id and company_id=_company_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  update public.products set estoque_atual=counted, updated_at=now() where id=_product_id and company_id=_company_id;
  if counted <> product_row.estoque_atual then
    insert into public.stock_movements(company_id,produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,motivo,created_by)
    values (_company_id,_product_id,case when counted>product_row.estoque_atual then 'ajuste_positivo' else 'ajuste_negativo' end,counted-product_row.estoque_atual,product_row.estoque_atual,counted,nullif(trim(coalesce(_reason,'')),''),auth.uid());
  end if;
end;
$function$;

create or replace function public.register_stock_restock(_company_id uuid, _product_id uuid, _quantity numeric, _unit_cost numeric, _reason text)
returns void language plpgsql security definer set search_path to '' as $function$
declare product_row public.products%rowtype; received integer; new_stock integer;
begin
  if auth.uid() is null or not (
    public.has_company_role(_company_id, auth.uid(), 'dono'::public.app_role)
    or public.has_company_role(_company_id, auth.uid(), 'recepcao'::public.app_role)
  ) then raise exception 'Sem permissão para alterar o estoque desta empresa'; end if;
  received := round(coalesce(_quantity,0))::integer;
  if received <= 0 then raise exception 'A quantidade de reposição deve ser maior que zero'; end if;
  select * into product_row from public.products where id=_product_id and company_id=_company_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  new_stock := product_row.estoque_atual + received;
  update public.products set estoque_atual=new_stock, estoque_total_recebido=coalesce(estoque_total_recebido,0)+received, custo_unitario=coalesce(_unit_cost,custo_unitario,0), updated_at=now() where id=_product_id and company_id=_company_id;
  insert into public.stock_movements(company_id,produto_id,tipo,quantidade,estoque_anterior,estoque_posterior,custo_unitario,motivo,created_by)
  values (_company_id,_product_id,'reposicao',received,product_row.estoque_atual,new_stock,_unit_cost,nullif(trim(coalesce(_reason,'')),''),auth.uid());
end;
$function$;