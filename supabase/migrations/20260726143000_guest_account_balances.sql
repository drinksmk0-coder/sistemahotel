-- Conta única do hóspede: hospedagem + consumos, com recebimentos parciais auditáveis.
alter table public.sales
  add column if not exists cliente_id uuid references public.clients(id) on delete set null,
  add column if not exists valor_pago numeric not null default 0,
  add column if not exists status text not null default 'pendente';

update public.sales sale
set cliente_id = reservation.cliente_id
from public.reservations reservation
where sale.reserva_id = reservation.id
  and sale.cliente_id is null;

create or replace function public.sync_sale_guest()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reserva_id is not null then
    select cliente_id into new.cliente_id
    from public.reservations
    where id = new.reserva_id;
  end if;
  new.status := case
    when coalesce(new.valor_pago, 0) >= coalesce(new.total, 0) then 'pago'
    when coalesce(new.valor_pago, 0) > 0 then 'parcial'
    else 'pendente'
  end;
  return new;
end;
$$;

drop trigger if exists sales_sync_guest on public.sales;
create trigger sales_sync_guest
before insert or update of reserva_id, valor_pago, total
on public.sales
for each row execute function public.sync_sale_guest();

create table if not exists public.guest_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  cliente_id uuid references public.clients(id) on delete set null,
  amount numeric not null check (amount > 0),
  method text not null default 'dinheiro',
  source text not null default 'conta',
  notes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists guest_payments_company_reservation_idx
  on public.guest_payments(company_id, reservation_id, created_at desc);

alter table public.guest_payments enable row level security;
grant select, insert, update, delete on public.guest_payments to authenticated;
grant all on public.guest_payments to service_role;
drop policy if exists guest_payments_company_all on public.guest_payments;
create policy guest_payments_company_all
on public.guest_payments
for all
to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

create or replace function public.register_guest_payment(
  p_reservation_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  reservation_row public.reservations%rowtype;
  sale_row public.sales%rowtype;
  remaining numeric;
  applied numeric;
  lodging_balance numeric;
  sale_balance numeric;
  account_balance numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'O valor do pagamento deve ser maior que zero.';
  end if;

  select * into reservation_row
  from public.reservations
  where id = p_reservation_id
  for update;
  if not found then raise exception 'Reserva não encontrada ou sem permissão de acesso.'; end if;

  lodging_balance := greatest(0, coalesce(reservation_row.valor_total, 0) - coalesce(reservation_row.valor_pago, 0));
  select lodging_balance + coalesce(sum(greatest(0, coalesce(total, 0) - coalesce(valor_pago, 0))), 0)
  into account_balance
  from public.sales
  where reserva_id = reservation_row.id and company_id = reservation_row.company_id;

  if account_balance <= 0 then raise exception 'Esta conta já está quitada.'; end if;
  if p_amount > account_balance then raise exception 'O pagamento não pode ser maior que o saldo da conta.'; end if;
  remaining := p_amount;

  if lodging_balance > 0 then
    applied := least(remaining, lodging_balance);
    update public.reservations
    set valor_pago = coalesce(valor_pago, 0) + applied,
        pago = coalesce(valor_pago, 0) + applied >= coalesce(valor_total, 0),
        pagamento = coalesce(nullif(trim(p_method), ''), pagamento),
        updated_at = now()
    where id = reservation_row.id;
    remaining := remaining - applied;
  end if;

  for sale_row in
    select * from public.sales
    where reserva_id = reservation_row.id
      and company_id = reservation_row.company_id
      and coalesce(valor_pago, 0) < coalesce(total, 0)
    order by data, created_at, id
    for update
  loop
    exit when remaining <= 0;
    sale_balance := greatest(0, coalesce(sale_row.total, 0) - coalesce(sale_row.valor_pago, 0));
    applied := least(remaining, sale_balance);
    update public.sales
    set valor_pago = coalesce(valor_pago, 0) + applied,
        pagamento = coalesce(nullif(trim(p_method), ''), pagamento)
    where id = sale_row.id;
    remaining := remaining - applied;
  end loop;

  insert into public.guest_payments(company_id, reservation_id, cliente_id, amount, method, source, notes)
  values (reservation_row.company_id, reservation_row.id, reservation_row.cliente_id, p_amount,
    coalesce(nullif(trim(p_method), ''), 'não informado'), 'conta', nullif(trim(p_notes), ''));

  return jsonb_build_object(
    'reservation_id', reservation_row.id,
    'amount_received', p_amount,
    'previous_balance', account_balance,
    'remaining_balance', account_balance - p_amount
  );
end;
$$;

grant execute on function public.register_guest_payment(uuid, numeric, text, text) to authenticated;
