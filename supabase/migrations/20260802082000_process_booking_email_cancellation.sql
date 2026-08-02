create or replace function public.process_booking_email_cancellation(
  p_company_id uuid,
  p_gmail_message_id text,
  p_sender text,
  p_subject text,
  p_body text,
  p_received_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_hotel_id text;
  v_event_id uuid;
  v_reservation record;
  v_existing record;
  v_note text;
begin
  if nullif(trim(p_gmail_message_id), '') is null then
    raise exception 'gmail_message_id obrigatório';
  end if;

  select id, status, reservation_id, booking_code
    into v_existing
  from public.booking_email_events
  where company_id = p_company_id
    and gmail_message_id = p_gmail_message_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicated', true,
      'status', v_existing.status,
      'reservation_id', v_existing.reservation_id,
      'booking_code', v_existing.booking_code
    );
  end if;

  v_code := coalesce(
    (regexp_match(coalesce(p_subject, '') || E'\n' || coalesce(p_body, ''), '\(([0-9]{8,12}),'))[1],
    (regexp_match(coalesce(p_body, ''), 'res_id=([0-9]{8,12})'))[1]
  );
  v_hotel_id := (regexp_match(coalesce(p_body, ''), 'hotel_id=([0-9]+)'))[1];

  if not (
    coalesce(p_sender, '') ~* 'noreply@booking\.com'
    or coalesce(p_body, '') ~* E'(^|\n)De:\\s*<?noreply@booking\\.com>?'
  ) then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
      received_at, status, error, processed_at
    ) values (
      p_company_id, p_gmail_message_id, coalesce(v_code, 'nao-identificado'),
      v_hotel_id, p_sender, p_subject, p_received_at, 'ignored',
      'Mensagem não comprovada como enviada pela Booking.com', now()
    );
    return jsonb_build_object('ok', true, 'ignored', true, 'reason', 'untrusted_sender');
  end if;

  if not ((coalesce(p_subject, '') || E'\n' || coalesce(p_body, '')) ~* 'cancelamento de reserva|cancellation') then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
      received_at, status, error, processed_at
    ) values (
      p_company_id, p_gmail_message_id, coalesce(v_code, 'nao-identificado'),
      v_hotel_id, p_sender, p_subject, p_received_at, 'ignored',
      'E-mail não é um cancelamento', now()
    );
    return jsonb_build_object('ok', true, 'ignored', true, 'reason', 'not_cancellation');
  end if;

  if v_code is null then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
      received_at, status, error
    ) values (
      p_company_id, p_gmail_message_id, 'nao-identificado', v_hotel_id,
      p_sender, p_subject, p_received_at, 'needs_review',
      'Código da reserva não encontrado'
    );
    return jsonb_build_object('ok', true, 'needs_review', true, 'reason', 'missing_booking_code');
  end if;

  if v_hotel_id is distinct from '12775712' then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
      received_at, status, error
    ) values (
      p_company_id, p_gmail_message_id, v_code, v_hotel_id,
      p_sender, p_subject, p_received_at, 'needs_review',
      'hotel_id ausente ou diferente do Hotel Real Cruzília'
    );
    return jsonb_build_object('ok', true, 'needs_review', true, 'reason', 'hotel_id_mismatch');
  end if;

  select id, status, observacoes_importacao
    into v_reservation
  from public.reservations
  where company_id = p_company_id
    and codigo_externo = v_code
  limit 1;

  if not found then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
      received_at, status, error
    ) values (
      p_company_id, p_gmail_message_id, v_code, v_hotel_id,
      p_sender, p_subject, p_received_at, 'needs_review',
      'Reserva não encontrada pelo código externo'
    );
    return jsonb_build_object('ok', true, 'needs_review', true, 'reason', 'reservation_not_found');
  end if;

  if v_reservation.status = 'cancelado' then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
      received_at, status, reservation_id, previous_status, new_status, processed_at
    ) values (
      p_company_id, p_gmail_message_id, v_code, v_hotel_id,
      p_sender, p_subject, p_received_at, 'already_cancelled',
      v_reservation.id, 'cancelado', 'cancelado', now()
    );
    return jsonb_build_object(
      'ok', true, 'already_cancelled', true,
      'reservation_id', v_reservation.id, 'booking_code', v_code
    );
  end if;

  if v_reservation.status <> 'reservado' then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
      received_at, status, reservation_id, previous_status, error
    ) values (
      p_company_id, p_gmail_message_id, v_code, v_hotel_id,
      p_sender, p_subject, p_received_at, 'needs_review',
      v_reservation.id, v_reservation.status,
      'Status diferente de reservado exige conferência humana'
    );
    return jsonb_build_object(
      'ok', true, 'needs_review', true,
      'reason', 'unexpected_reservation_status',
      'reservation_id', v_reservation.id,
      'current_status', v_reservation.status
    );
  end if;

  v_note := format(
    'Cancelamento Booking %s recebido automaticamente por Gmail em %s.',
    v_code,
    p_received_at
  );

  update public.reservations
  set status = 'cancelado',
      observacoes_importacao = concat_ws(E'\n', nullif(observacoes_importacao, ''), v_note)
  where id = v_reservation.id
    and company_id = p_company_id
    and status = 'reservado';

  if not found then
    raise exception 'Reserva mudou durante o processamento';
  end if;

  insert into public.booking_email_events (
    company_id, gmail_message_id, booking_code, hotel_id, sender, subject,
    received_at, status, reservation_id, previous_status, new_status, processed_at
  ) values (
    p_company_id, p_gmail_message_id, v_code, v_hotel_id,
    p_sender, p_subject, p_received_at, 'processed',
    v_reservation.id, v_reservation.status, 'cancelado', now()
  ) returning id into v_event_id;

  return jsonb_build_object(
    'ok', true,
    'cancelled_locally', true,
    'event_id', v_event_id,
    'booking_code', v_code,
    'reservation_id', v_reservation.id,
    'previous_status', v_reservation.status,
    'new_status', 'cancelado'
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'duplicated', true);
end;
$$;

revoke all on function public.process_booking_email_cancellation(uuid, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.process_booking_email_cancellation(uuid, text, text, text, text, timestamptz)
  to service_role;

comment on function public.process_booking_email_cancellation(uuid, text, text, text, text, timestamptz) is
  'Valida aviso de cancelamento da Booking e altera somente o status da reserva local. Não exclui dados.';
