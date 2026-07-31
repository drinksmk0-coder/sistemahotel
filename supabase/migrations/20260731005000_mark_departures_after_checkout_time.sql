create or replace function public.mark_overdue_departures()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_updated integer := 0;
  v_now_local timestamp := now() at time zone 'America/Sao_Paulo';
begin
  for v_row in
    update public.reservations
       set status = 'saida_pendente',
           updated_at = now()
     where status = 'ocupado'
       and (
         checkout::timestamp
         + coalesce(horario_checkout, '12:00:00'::time)
       ) < v_now_local
    returning company_id, quarto
  loop
    v_updated := v_updated + 1;
    update public.rooms
       set situacao = 'limpeza'
     where company_id = v_row.company_id
       and numero = v_row.quarto
       and situacao not in ('manutencao');
  end loop;

  update public.reservations
     set billing_status = 'overdue',
         updated_at = now()
   where billing_responsibility = 'company'
     and billing_status = 'pending'
     and billing_due_date is not null
     and billing_due_date < public.hotel_operational_date(now());

  return v_updated;
end;
$$;

select public.mark_overdue_departures();
