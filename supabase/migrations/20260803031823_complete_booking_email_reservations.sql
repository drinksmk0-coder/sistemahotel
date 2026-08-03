create or replace function public.complete_booking_email_reservation(
  p_event_id uuid,
  p_guest_name text,
  p_room integer,
  p_checkout date,
  p_people integer,
  p_total numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.booking_email_events;
  v_room public.rooms;
  v_reservation_id uuid;
  v_nights integer;
  v_total numeric;
begin
  select * into v_event
  from public.booking_email_events
  where id = p_event_id
  for update;

  if v_event.id is null then
    raise exception 'Mensagem da Booking não encontrada';
  end if;
  if v_event.event_type <> 'new_reservation' then
    raise exception 'Este evento não é uma nova reserva';
  end if;
  if not (
    public.has_company_role(v_event.company_id, auth.uid(), 'dono'::public.app_role)
    or public.has_company_role(v_event.company_id, auth.uid(), 'recepcao'::public.app_role)
  ) then
    raise exception 'Usuário sem permissão para criar a reserva';
  end if;
  if v_event.reservation_id is not null then
    return v_event.reservation_id;
  end if;
  if coalesce(length(trim(p_guest_name)), 0) < 3 then
    raise exception 'Informe o nome do hóspede';
  end if;
  if v_event.checkin is null or p_checkout is null or p_checkout <= v_event.checkin then
    raise exception 'Confira as datas de entrada e saída';
  end if;

  select * into v_room
  from public.rooms
  where company_id = v_event.company_id
    and numero = p_room;

  if v_room.id is null then
    raise exception 'Quarto não encontrado';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.company_id = v_event.company_id
      and r.quarto = p_room
      and r.status not in ('cancelado', 'finalizado', 'manutencao')
      and r.checkin < p_checkout
      and r.checkout > v_event.checkin
  ) then
    raise exception 'O quarto já possui reserva nesse período';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.company_id = v_event.company_id
      and r.codigo_externo = v_event.booking_code
  ) then
    select id into v_reservation_id
    from public.reservations
    where company_id = v_event.company_id
      and codigo_externo = v_event.booking_code
    limit 1;
  else
    v_nights := greatest(1, p_checkout - v_event.checkin);
    v_total := case
      when coalesce(p_total, 0) > 0 then p_total
      else coalesce(v_room.preco, 0) * v_nights
    end;

    insert into public.reservations (
      company_id,
      quarto,
      cliente_id,
      cliente_nome,
      data_reserva,
      checkin,
      checkout,
      diarias,
      valor_diaria,
      valor_total,
      valor_pago,
      desconto,
      pessoas,
      canal,
      pagamento,
      pago,
      status,
      codigo_externo,
      origem_importacao,
      observacoes_importacao,
      horario_checkin,
      horario_checkout,
      created_by
    ) values (
      v_event.company_id,
      p_room,
      null,
      trim(p_guest_name),
      public.hotel_operational_date(now()),
      v_event.checkin,
      p_checkout,
      v_nights,
      case when v_nights > 0 then v_total / v_nights else v_total end,
      v_total,
      0,
      0,
      greatest(1, coalesce(p_people, 1)),
      'Booking',
      'Pendente',
      false,
      'reservado',
      v_event.booking_code,
      'Booking Gmail',
      'Reserva criada após conferência da mensagem ' || v_event.gmail_message_id,
      '15:00:00'::time,
      '12:00:00'::time,
      auth.uid()
    ) returning id into v_reservation_id;
  end if;

  update public.booking_email_events
  set status = 'processed',
      reservation_id = v_reservation_id,
      error = null,
      processed_at = now(),
      details = details || jsonb_build_object(
        'guest_name', trim(p_guest_name),
        'room', p_room,
        'checkout', p_checkout,
        'people', greatest(1, coalesce(p_people, 1)),
        'total', p_total
      )
  where id = v_event.id;

  return v_reservation_id;
end;
$$;

revoke all on function public.complete_booking_email_reservation(uuid, text, integer, date, integer, numeric)
  from public, anon;
grant execute on function public.complete_booking_email_reservation(uuid, text, integer, date, integer, numeric)
  to authenticated;
