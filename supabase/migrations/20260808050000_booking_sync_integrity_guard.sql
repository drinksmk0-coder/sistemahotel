create or replace function public.sync_booking_event_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_unsafe integer := 0;
  v_first_id uuid;
  v_had_reserved boolean := false;
  v_code text;
begin
  v_code := regexp_replace(coalesce(new.booking_code, ''), '\D', '', 'g');
  if v_code = '' then
    return new;
  end if;

  if new.event_type = 'cancellation_details' then
    select
      count(*),
      count(*) filter (where r.status not in ('reservado', 'cancelado')),
      (array_agg(r.id order by r.created_at, r.id))[1],
      coalesce(bool_or(r.status = 'reservado'), false)
    into v_count, v_unsafe, v_first_id, v_had_reserved
    from public.reservations r
    where r.company_id = new.company_id
      and regexp_replace(coalesce(r.codigo_externo, ''), '\D', '', 'g') = v_code;

    if v_count > 0 and v_unsafe = 0 then
      update public.reservations r
      set
        status = 'cancelado',
        observacoes_importacao = concat_ws(E'\n', r.observacoes_importacao,
          case when r.status = 'reservado'
            then 'Cancelamento Booking ' || v_code || ' sincronizado automaticamente pelo guard de integridade em ' || now()::text
            else null
          end),
        updated_at = case when r.status = 'reservado' then now() else r.updated_at end
      where r.company_id = new.company_id
        and regexp_replace(coalesce(r.codigo_externo, ''), '\D', '', 'g') = v_code
        and r.status in ('reservado', 'cancelado');

      new.status := 'processed';
      new.reservation_id := coalesce(new.reservation_id, v_first_id);
      new.previous_status := coalesce(new.previous_status, case when v_had_reserved then 'reservado' else 'cancelado' end);
      new.new_status := 'cancelado';
      new.error := null;
      new.processed_at := coalesce(new.processed_at, now());
    end if;

  elsif new.event_type = 'reservation_details' then
    select count(*), (array_agg(r.id order by r.created_at, r.id))[1]
      into v_count, v_first_id
    from public.reservations r
    where r.company_id = new.company_id
      and regexp_replace(coalesce(r.codigo_externo, ''), '\D', '', 'g') = v_code;

    if v_count > 1 then
      new.status := 'processed';
      new.reservation_id := coalesce(new.reservation_id, v_first_id);
      new.error := null;
      new.processed_at := coalesce(new.processed_at, now());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_booking_event_integrity on public.booking_browser_events;
create trigger trg_sync_booking_event_integrity
before insert or update of booking_code, event_type, status, reservation_id, error
on public.booking_browser_events
for each row execute function public.sync_booking_event_integrity();

create or replace function public.prevent_booking_auto_duplicate_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
begin
  if coalesce(new.origem_importacao, '') <> 'booking_extranet_chrome' then
    return new;
  end if;

  v_code := regexp_replace(coalesce(new.codigo_externo, ''), '\D', '', 'g');
  if v_code = '' then
    return new;
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.company_id = new.company_id
      and regexp_replace(coalesce(r.codigo_externo, ''), '\D', '', 'g') = v_code
  ) then
    raise exception using
      errcode = '23505',
      message = format('Booking %s já está vinculada a uma ou mais reservas. Criação automática duplicada bloqueada; reconcilie o grupo existente.', v_code);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_booking_auto_duplicate_code on public.reservations;
create trigger trg_prevent_booking_auto_duplicate_code
before insert on public.reservations
for each row execute function public.prevent_booking_auto_duplicate_code();

comment on function public.sync_booking_event_integrity() is 'Garante que cancelamentos Booking com código externo exato cancelem todas as UHs seguras do mesmo código e normaliza eventos de reservas em grupo.';
comment on function public.prevent_booking_auto_duplicate_code() is 'Bloqueia criação automática de uma nova UH quando o código Booking já existe; evita duplicações quando uma reserva em grupo já foi reconciliada.';