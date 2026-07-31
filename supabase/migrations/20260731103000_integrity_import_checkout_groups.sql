-- Permite que um mesmo código externo represente várias UHs da mesma reserva em grupo,
-- sem permitir repetir exatamente a mesma estadia no mesmo quarto.
drop index if exists public.reservations_company_external_code_uidx;
drop index if exists public.reservations_company_external_stay_unique;
create unique index if not exists reservations_company_external_stay_normalized_uidx
  on public.reservations (
    company_id,
    lower(trim(codigo_externo)),
    quarto,
    checkin,
    checkout
  )
  where codigo_externo is not null
    and trim(codigo_externo) <> '';

create or replace function public.assign_imported_reservation_group()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_group_id uuid;
  v_lock_key text;
begin
  if new.codigo_externo is null
     or trim(new.codigo_externo) = ''
     or lower(trim(coalesce(new.origem_importacao, ''))) not like 'hospedin%'
     or new.group_id is not null
     or new.status in ('cancelado', 'manutencao') then
    return new;
  end if;

  v_lock_key := new.company_id::text || '|' || lower(trim(new.codigo_externo));
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  select reservation.id, reservation.group_id
    into v_existing_id, v_group_id
    from public.reservations as reservation
   where reservation.company_id = new.company_id
     and reservation.id <> coalesce(new.id, gen_random_uuid())
     and lower(trim(reservation.codigo_externo)) = lower(trim(new.codigo_externo))
     and reservation.quarto <> new.quarto
     and reservation.status not in ('cancelado', 'manutencao')
     and new.checkin < reservation.checkout
     and new.checkout > reservation.checkin
   order by reservation.created_at
   limit 1
   for update;

  if v_existing_id is null then
    return new;
  end if;

  if v_group_id is null then
    v_group_id := gen_random_uuid();
    update public.reservations
       set group_id = v_group_id,
           updated_at = now()
     where id = v_existing_id;
  end if;

  new.group_id := v_group_id;
  return new;
end;
$$;

revoke all on function public.assign_imported_reservation_group() from public, anon, authenticated;

drop trigger if exists aa_assign_imported_reservation_group on public.reservations;
create trigger aa_assign_imported_reservation_group
before insert or update of codigo_externo, origem_importacao, checkin, checkout, quarto
on public.reservations
for each row execute function public.assign_imported_reservation_group();

-- Identidade imutável da venda importada. Pagamento, status e data de atualização
-- não participam da chave e, portanto, não geram uma nova receita.
alter table public.sales
  add column if not exists import_identity text;

create unique index if not exists sales_company_import_identity_uidx
  on public.sales (company_id, import_identity)
  where import_identity is not null
    and trim(import_identity) <> '';

create or replace function public.reconcile_hospedin_sale_import()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_created_at text;
  v_reservation_code text;
  v_identity text;
  v_existing public.sales;
  v_paid numeric;
begin
  if lower(trim(coalesce(new.import_source, ''))) <> 'hospedin financeiro' then
    return new;
  end if;

  v_created_at := nullif(
    trim(substring(coalesce(new.observacoes, '') from 'Criado na origem em ([^·]+)')),
    ''
  );
  v_reservation_code := nullif(
    trim(substring(coalesce(new.observacoes, '') from 'Reserva externa ([^·]+)')),
    ''
  );

  if v_created_at is not null then
    v_identity := lower(concat_ws(
      '|',
      'hospedin',
      coalesce(v_reservation_code, ''),
      new.quarto::text,
      new.data::text,
      regexp_replace(trim(new.item), '\s+', ' ', 'g'),
      v_created_at
    ));
  else
    v_identity := lower(concat_ws(
      '|',
      'hospedin',
      coalesce(v_reservation_code, ''),
      new.quarto::text,
      new.data::text,
      regexp_replace(trim(new.item), '\s+', ' ', 'g'),
      coalesce(trim(new.categoria), ''),
      new.qtd::text,
      new.total::text,
      coalesce(trim(new.external_code), '')
    ));
  end if;

  new.import_identity := v_identity;
  perform pg_advisory_xact_lock(
    hashtextextended(new.company_id::text || '|' || v_identity, 0)
  );

  select sale.*
    into v_existing
    from public.sales as sale
   where sale.company_id = new.company_id
     and sale.import_identity = v_identity
   limit 1
   for update;

  if v_existing.id is null then
    return new;
  end if;

  v_paid := least(
    new.total,
    greatest(coalesce(v_existing.valor_pago, 0), coalesce(new.valor_pago, 0))
  );

  update public.sales
     set quarto = new.quarto,
         reserva_id = coalesce(new.reserva_id, v_existing.reserva_id),
         cliente_id = coalesce(new.cliente_id, v_existing.cliente_id),
         item = new.item,
         categoria = new.categoria,
         produto_id = coalesce(new.produto_id, v_existing.produto_id),
         qtd = new.qtd,
         valor_unit = new.valor_unit,
         total = new.total,
         valor_pago = v_paid,
         status = case
           when v_paid >= new.total then 'pago'
           when v_paid > 0 then 'parcial'
           else 'pendente'
         end,
         pagamento = new.pagamento,
         data = new.data,
         observacoes = coalesce(new.observacoes, v_existing.observacoes),
         import_source = new.import_source
   where id = v_existing.id;

  return null;
end;
$$;

revoke all on function public.reconcile_hospedin_sale_import() from public, anon, authenticated;

drop trigger if exists aa_reconcile_hospedin_sale_import on public.sales;
create trigger aa_reconcile_hospedin_sale_import
before insert on public.sales
for each row execute function public.reconcile_hospedin_sale_import();

-- Uma saída vencida exige conferência humana. O quarto permanece ocupado até o check-out real.
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
grant execute on function public.mark_overdue_departures() to service_role;

-- A reserva e a situação do quarto passam a ser alteradas na mesma transação.
-- Se a atualização do quarto falhar, o check-out inteiro é revertido.
create or replace function public.sync_room_cleanup_on_checkout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'finalizado'
     and old.status is distinct from 'finalizado' then
    update public.rooms
       set situacao = 'limpeza'
     where company_id = new.company_id
       and numero = new.quarto
       and coalesce(situacao, '') <> 'manutencao';

    if not found then
      if exists (
        select 1
          from public.rooms
         where company_id = new.company_id
           and numero = new.quarto
           and situacao = 'manutencao'
      ) then
        return new;
      end if;

      raise exception 'Não foi possível enviar a UH % para limpeza durante o check-out.', new.quarto;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_room_cleanup_on_checkout() from public, anon, authenticated;

drop trigger if exists reservations_sync_room_cleanup_checkout on public.reservations;
create trigger reservations_sync_room_cleanup_checkout
after update of status on public.reservations
for each row execute function public.sync_room_cleanup_on_checkout();
