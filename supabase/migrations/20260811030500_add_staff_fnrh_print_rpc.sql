create or replace function public.get_guest_checkin_staff(p_checkin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_gc public.guest_checkins%rowtype;
  v_company public.companies%rowtype;
  v_reservation public.reservations%rowtype;
  v_client public.clients%rowtype;
  v_is_staff boolean := false;
begin
  if auth.uid() is null then
    return null;
  end if;

  select * into v_gc
  from public.guest_checkins
  where id = p_checkin_id
  limit 1;

  if v_gc.id is null then
    return null;
  end if;

  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = v_gc.company_id
      and cm.user_id = auth.uid()
      and cm.ativo = true
      and cm.role in ('dono'::public.app_role, 'recepcao'::public.app_role)
  ) into v_is_staff;

  if not v_is_staff then
    return null;
  end if;

  select * into v_company
  from public.companies
  where id = v_gc.company_id;

  select * into v_reservation
  from public.reservations
  where id = v_gc.reservation_id
    and company_id = v_gc.company_id;

  if v_reservation.id is null then
    return null;
  end if;

  if v_gc.client_id is not null then
    select * into v_client
    from public.clients
    where id = v_gc.client_id
      and company_id = v_gc.company_id;
  elsif v_reservation.cliente_id is not null then
    select * into v_client
    from public.clients
    where id = v_reservation.cliente_id
      and company_id = v_gc.company_id;
  end if;

  return jsonb_build_object(
    'id', v_gc.id,
    'status', v_gc.status,
    'submitted_at', v_gc.submitted_at,
    'form_data', v_gc.form_data,
    'signature_data_url', v_gc.signature_data_url,
    'expires_at', null,
    'company_name', v_company.nome,
    'company_document', v_company.documento,
    'company_email', v_company.email,
    'company_phone', coalesce(v_company.whatsapp, v_company.telefone),
    'company_address', v_company.endereco,
    'company_city', v_company.cidade,
    'company_state', v_company.estado,
    'reservation_code', coalesce(v_reservation.codigo_externo, left(v_reservation.id::text, 8)),
    'room', v_reservation.quarto,
    'checkin', v_reservation.checkin,
    'checkout', v_reservation.checkout,
    'adults', v_reservation.pessoas,
    'children', 0,
    'guest', jsonb_build_object(
      'name', coalesce(v_client.nome, v_reservation.cliente_nome),
      'email', v_client.email,
      'phone', v_client.telefone,
      'document', coalesce(v_client.cpf, v_client.documento),
      'birth_date', v_client.data_nascimento,
      'profession', v_client.profissao,
      'gender', v_client.sexo,
      'civil_status', v_client.estado_civil,
      'city', v_client.cidade,
      'state', v_client.estado,
      'country', v_client.pais,
      'postal_code', v_client.cep,
      'district', v_client.bairro
    )
  );
end;
$function$;

revoke all on function public.get_guest_checkin_staff(uuid) from public;
revoke all on function public.get_guest_checkin_staff(uuid) from anon;
grant execute on function public.get_guest_checkin_staff(uuid) to authenticated;
grant execute on function public.get_guest_checkin_staff(uuid) to service_role;
