-- Evita que uma reimportação atualizada da mesma venda crie receita duplicada.
-- A identidade usa somente campos estáveis da origem. Pagamento/status são atualizados.
create or replace function public.merge_reimported_sale()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing_id uuid;
begin
  if new.import_source is null or btrim(new.import_source) = '' then
    return new;
  end if;

  select s.id
    into v_existing_id
    from public.sales s
   where s.company_id = new.company_id
     and lower(btrim(coalesce(s.import_source, ''))) = lower(btrim(new.import_source))
     and s.quarto = new.quarto
     and s.data = new.data
     and lower(btrim(coalesce(s.item, ''))) = lower(btrim(coalesce(new.item, '')))
     and lower(btrim(coalesce(s.categoria, ''))) = lower(btrim(coalesce(new.categoria, '')))
     and s.qtd = new.qtd
     and round(s.total::numeric, 2) = round(new.total::numeric, 2)
   order by s.created_at asc
   limit 1;

  if v_existing_id is null then
    return new;
  end if;

  update public.sales
     set reserva_id = coalesce(new.reserva_id, reserva_id),
         cliente_id = coalesce(new.cliente_id, cliente_id),
         valor_unit = new.valor_unit,
         valor_pago = new.valor_pago,
         status = new.status,
         pagamento = new.pagamento,
         observacoes = new.observacoes,
         external_code = coalesce(new.external_code, external_code),
         updated_at = now()
   where id = v_existing_id;

  -- Cancela o INSERT: a linha existente foi atualizada dentro da mesma transação.
  return null;
end;
$$;

drop trigger if exists sales_merge_reimported_before_insert on public.sales;
create trigger sales_merge_reimported_before_insert
before insert on public.sales
for each row
execute function public.merge_reimported_sale();

revoke all on function public.merge_reimported_sale() from public, anon, authenticated;

-- O atraso do checkout deve sinalizar a recepção, sem liberar o quarto para governança.
create or replace function public.mark_overdue_departures()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer := 0;
  v_now_local timestamp := now() at time zone 'America/Sao_Paulo';
begin
  update public.reservations
     set status = 'saida_pendente',
         updated_at = now()
   where status = 'ocupado'
     and (
       checkout::timestamp
       + coalesce(horario_checkout, '12:00:00'::time)
     ) < v_now_local;

  get diagnostics v_updated = row_count;

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

revoke all on function public.mark_overdue_departures() from public, anon, authenticated;

-- Finalizar uma reserva e mandar o quarto para limpeza passa a ocorrer na mesma transação.
create or replace function public.sync_room_after_reservation_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'finalizado' and old.status is distinct from 'finalizado' then
    update public.rooms
       set situacao = 'limpeza'
     where company_id = new.company_id
       and numero = new.quarto
       and situacao is distinct from 'manutencao';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_sync_room_after_checkout on public.reservations;
create trigger reservations_sync_room_after_checkout
after update of status on public.reservations
for each row
execute function public.sync_room_after_reservation_checkout();

revoke all on function public.sync_room_after_reservation_checkout() from public, anon, authenticated;
