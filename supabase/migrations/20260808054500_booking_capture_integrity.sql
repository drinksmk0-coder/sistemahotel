create or replace function public.normalize_booking_no_show_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
  v_code text;
  v_unsafe integer := 0;
  v_first_id uuid;
  v_had_reserved boolean := false;
begin
  -- Only use the reservation-specific status. Generic page excerpts can contain
  -- labels from other rows and must never classify the current booking.
  v_text := lower(concat_ws(' ', new.booking_status_text, new.payload->>'status_text'));
  v_code := regexp_replace(coalesce(new.booking_code,''), '\D', '', 'g');

  if coalesce(new.page_url,'') not ilike '%/finance_reservations.html%'
     and v_text ~ '(no[- ]?show|nao compareceu|não compareceu|nao comparecimento|não comparecimento)' then
    new.event_type := 'no_show';
    new.booking_status_text := coalesce(nullif(new.booking_status_text,''), 'No-show');

    select
      count(*) filter (where r.status not in ('reservado','no_show','cancelado')),
      (array_agg(r.id order by r.created_at,r.id))[1],
      coalesce(bool_or(r.status='reservado'),false)
    into v_unsafe,v_first_id,v_had_reserved
    from public.reservations r
    where r.company_id=new.company_id
      and regexp_replace(coalesce(r.codigo_externo,''),'\D','','g')=v_code;

    if v_unsafe=0 then
      update public.reservations r
      set status='no_show',
          presence_status='checkout',
          observacoes_importacao=concat_ws(E'\n',r.observacoes_importacao,
            case when r.status='reservado' then 'No-show Booking '||v_code||' sincronizado automaticamente em '||now()::text else null end),
          updated_at=case when r.status='reservado' then now() else r.updated_at end
      where r.company_id=new.company_id
        and regexp_replace(coalesce(r.codigo_externo,''),'\D','','g')=v_code
        and r.status='reservado';

      new.status := 'processed';
      new.reservation_id := coalesce(new.reservation_id,v_first_id);
      new.previous_status := coalesce(new.previous_status,case when v_had_reserved then 'reservado' else null end);
      new.new_status := 'no_show';
      new.error := null;
      new.processed_at := coalesce(new.processed_at,now());
    else
      new.status := 'needs_review';
      new.new_status := 'no_show';
      new.error := 'No-show Booking localizado, mas existe reserva em estado operacional que exige revisão manual.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.reject_booking_finance_list_false_cancellation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_type='cancellation_details'
     and coalesce(new.page_url,'') ilike '%/finance_reservations.html%'
     and nullif(btrim(coalesce(new.guest_name,'')),'') is null
     and nullif(btrim(coalesce(new.checkin_text,'')),'') is null
     and nullif(btrim(coalesce(new.checkout_text,'')),'') is null
     and nullif(btrim(coalesce(new.total_text,'')),'') is null then
    new.event_type := 'ignored_finance_page';
    new.status := 'rejected';
    new.error := 'Captura genérica da lista financeira ignorada: sem hóspede, datas ou valor para comprovar cancelamento.';
    new.processed_at := coalesce(new.processed_at,now());
    new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object(
      'integrity_guard','ignored_generic_finance_cancellation',
      'ignored_at',now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_00_reject_booking_finance_list_false_cancellation on public.booking_browser_events;
create trigger trg_00_reject_booking_finance_list_false_cancellation
before insert or update
on public.booking_browser_events
for each row execute function public.reject_booking_finance_list_false_cancellation();

comment on function public.reject_booking_finance_list_false_cancellation() is 'Rejects generic Booking finance-list captures that contain no guest, dates or amount, preventing false cancellation KPIs.';