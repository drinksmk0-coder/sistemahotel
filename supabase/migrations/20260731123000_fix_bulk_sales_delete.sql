-- Corrige a exclusão em massa de vendas quando a devolução de estoque esbarra em RLS.
-- A exclusão da venda continua sujeita às políticas da tabela sales.
create or replace function public.restore_product_stock_on_sale_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
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

drop trigger if exists trg_restore_product_stock_on_sale_delete on public.sales;
create trigger trg_restore_product_stock_on_sale_delete
before delete on public.sales
for each row execute function public.restore_product_stock_on_sale_delete();
