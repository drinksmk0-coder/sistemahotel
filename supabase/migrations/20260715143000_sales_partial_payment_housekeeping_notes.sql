alter table public.sales add column if not exists valor_pago numeric not null default 0;
alter table public.sales add column if not exists status text not null default 'pago';
alter table public.sales add column if not exists observacoes text;

update public.sales
set valor_pago = total,
    status = case when total > 0 then 'pago' else 'pendente' end
where valor_pago = 0 and status = 'pago';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_status_check' and conrelid = 'public.sales'::regclass
  ) then
    alter table public.sales
      add constraint sales_status_check
      check (status in ('pago', 'parcial', 'pendente'))
      not valid;
  end if;
end $$;

alter table public.sales validate constraint sales_status_check;
