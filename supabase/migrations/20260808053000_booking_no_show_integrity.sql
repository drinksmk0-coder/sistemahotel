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
  v_text := lower(concat_ws(' ', new.booking_status_text, new.payload->>'status_text', new.payload->>'raw_excerpt'));
  v_code := regexp_replace(coalesce(new.booking_code,''), '\D', '', 'g');

  if v_text ~ '(no[- ]?show|nao compareceu|não compareceu|nao comparecimento|não comparecimento)' then
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

drop trigger if exists trg_00_normalize_booking_no_show on public.booking_browser_events;
create trigger trg_00_normalize_booking_no_show
before insert or update of booking_code,booking_status_text,payload,status,error
on public.booking_browser_events
for each row execute function public.normalize_booking_no_show_event();

create or replace function public.prevent_booking_auto_create_from_no_show()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
begin
  if coalesce(new.origem_importacao,'') <> 'booking_extranet_chrome' then
    return new;
  end if;
  v_code := regexp_replace(coalesce(new.codigo_externo,''),'\D','','g');
  if v_code='' then return new; end if;

  if exists (
    select 1 from public.booking_browser_events e
    where e.company_id=new.company_id
      and regexp_replace(coalesce(e.booking_code,''),'\D','','g')=v_code
      and e.event_type='no_show'
  ) then
    raise exception using errcode='23514', message=format('Booking %s é no-show; criação automática como reserva ativa foi bloqueada.',v_code);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_00_prevent_booking_auto_no_show on public.reservations;
create trigger trg_00_prevent_booking_auto_no_show
before insert on public.reservations
for each row execute function public.prevent_booking_auto_create_from_no_show();

comment on function public.normalize_booking_no_show_event() is 'Normaliza eventos Booking de no-show, evita ocupação/receita ativa e vincula reserva existente apenas quando seguro.';
comment on function public.prevent_booking_auto_create_from_no_show() is 'Bloqueia criação automática de reserva ativa quando o Booking já foi classificado como no-show.';