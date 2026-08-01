create or replace function public.sync_reservation_operational_financial_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance numeric := greatest(coalesce(new.valor_total, 0) - coalesce(new.valor_pago, 0), 0);
  v_reference_date date := hotel_operational_date(now());
begin
  new.presence_status := case
    when new.checkout_at is not null or new.status = 'finalizado' then 'checkout'
    when new.status in ('ocupado', 'saida_pendente') then 'no_hotel'
    else 'aguardando'
  end;

  new.billing_status := case
    when v_balance <= 0 then 'paid'
    when coalesce(new.billing_due_date, new.checkout) < v_reference_date then 'overdue'
    else 'pending'
  end;

  return new;
end;
$$;

drop trigger if exists reservations_sync_operational_financial_status on public.reservations;
create trigger reservations_sync_operational_financial_status
before insert or update of status, checkout_at, valor_total, valor_pago, billing_due_date, billing_responsibility
on public.reservations
for each row
execute function public.sync_reservation_operational_financial_status();

update public.reservations set status = status;

create or replace view public.reservation_operational_financial_status
with (security_invoker = true)
as
select
  r.id,
  r.company_id,
  r.quarto,
  r.cliente_id,
  r.cliente_nome,
  r.checkin,
  r.checkout as data_saida_prevista,
  (r.checkout_at at time zone 'America/Sao_Paulo') as data_saida_real,
  r.status as status_hospedagem,
  r.presence_status as status_presenca,
  case
    when r.status = 'ocupado' then 'ocupado'
    when r.status = 'saida_pendente' then 'saida_aguardando_conferencia'
    when r.status = 'finalizado' or r.checkout_at is not null then 'liberado'
    when r.status in ('cancelado', 'no_show') then 'nao_ocupou'
    else 'reservado'
  end as status_operacional_quarto,
  r.billing_responsibility as responsavel_pagamento,
  r.billing_company_name as empresa_pagadora,
  r.billing_due_date as vencimento_financeiro,
  r.billing_status as status_financeiro,
  r.valor_total,
  r.valor_pago,
  greatest(coalesce(r.valor_total, 0) - coalesce(r.valor_pago, 0), 0) as saldo_pendente,
  case
    when greatest(coalesce(r.valor_total, 0) - coalesce(r.valor_pago, 0), 0) <= 0 then 0
    else greatest(hotel_operational_date(now()) - coalesce(r.billing_due_date, r.checkout), 0)
  end as dias_em_atraso,
  r.codigo_externo,
  r.origem_importacao,
  r.created_at,
  r.updated_at
from public.reservations r;