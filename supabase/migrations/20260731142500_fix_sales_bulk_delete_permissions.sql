-- Permite que proprietário e recepção excluam vendas da própria empresa.
-- A devolução do estoque continua sendo executada pelo trigger de exclusão.

drop policy if exists sales_delete_staff on public.sales;
create policy sales_delete_staff
on public.sales
for delete
to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao')
);

-- Garante que o trigger consiga devolver o estoque mesmo com RLS ativa.
create or replace function public.restore_product_stock_on_sale_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.produto_id is not null and coalesce(old.qtd, 0) > 0 then
    update public.products
       set estoque_atual = estoque_atual + greatest(old.qtd, 0)
     where id = old.produto_id
       and company_id = old.company_id;
  end if;

  return old;
end;
$$;

revoke all on function public.restore_product_stock_on_sale_delete() from public, anon, authenticated;
