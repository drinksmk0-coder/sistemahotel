-- Reservation times shown in the booking form and room map.
alter table public.reservations
  add column if not exists horario_reserva time without time zone default current_time,
  add column if not exists horario_checkin time without time zone default time '14:00',
  add column if not exists horario_checkout time without time zone default time '12:00';

update public.reservations
set
  horario_reserva = coalesce(horario_reserva, created_at::time),
  horario_checkin = coalesce(horario_checkin, time '14:00'),
  horario_checkout = coalesce(horario_checkout, time '12:00');

-- Staff helper used by product RLS.
create or replace function public.is_staff(_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role in ('dono', 'recepcao', 'limpeza', 'cafe')
  );
$$;

-- Product inventory for segmented extra sales.
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text not null default 'Geral',
  preco numeric not null default 0,
  estoque_atual integer not null default 0,
  estoque_minimo integer not null default 0,
  ativo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  created_by uuid default auth.uid()
);

alter table public.sales
  add column if not exists produto_id uuid references public.products(id) on delete set null,
  add column if not exists categoria text;

update public.sales
set categoria = coalesce(categoria, 'Geral')
where categoria is null;

grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

drop policy if exists products_all_staff on public.products;
create policy products_all_staff on public.products
for all to authenticated
using (public.is_staff((select auth.uid())))
with check (public.is_staff((select auth.uid())));

create or replace function public.decrement_product_stock_on_sale()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.produto_id is not null then
    update public.products
    set estoque_atual = estoque_atual - greatest(new.qtd, 0)
    where id = new.produto_id
      and estoque_atual >= greatest(new.qtd, 0);

    if not found then
      raise exception 'Estoque insuficiente para este produto';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_decrement_product_stock_on_sale on public.sales;
create trigger trg_decrement_product_stock_on_sale
before insert on public.sales
for each row
execute function public.decrement_product_stock_on_sale();
