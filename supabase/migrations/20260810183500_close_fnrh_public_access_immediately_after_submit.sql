-- Fecha totalmente o acesso público à FNRH no instante do envio.
-- A impressão do hóspede passa a usar somente a cópia temporária da sessão do navegador.
-- Dono e recepção autenticados continuam com acesso completo para conferência/reimpressão.

create or replace function public.get_guest_checkin(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_gc public.guest_checkins%rowtype;
  v_company public.companies%rowtype;
  v_reservation public.reservations%rowtype;
  v_client public.clients%rowtype;
  v_is_staff boolean := false;
  v_public_open boolean := false;
  v_full_access boolean := false;
begin
  select * into v_gc
  from public.guest_checkins
  where public_token = p_token
  limit 1;

  if v_gc.id is null then
    return null;
  end if;

  if auth.uid() is not null then
    select exists (
      select 1
      from public.company_members cm
      where cm.company_id = v_gc.company_id
        and cm.user_id = auth.uid()
        and cm.ativo = true
        and cm.role in ('dono'::public.app_role, 'recepcao'::public.app_role)
    ) into v_is_staff;
  end if;

  v_public_open := v_gc.status = 'enviado' and v_gc.expires_at > now();
  v_full_access := v_is_staff;

  if not v_is_staff and not v_public_open then
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
    'submitted_at', case when v_full_access then v_gc.submitted_at else null end,
    'form_data', case when v_full_access then v_gc.form_data else '{}'::jsonb end,
    'signature_data_url', case when v_full_access then v_gc.signature_data_url else null end,
    'expires_at', case when v_public_open then v_gc.expires_at else null end,
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
    'guest', case
      when v_full_access then jsonb_build_object(
        'name', v_client.nome,
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
      else jsonb_build_object(
        'name', coalesce(v_client.nome, v_reservation.cliente_nome),
        'email', null,
        'phone', null,
        'document', null,
        'birth_date', null,
        'profession', null,
        'gender', null,
        'civil_status', null,
        'city', null,
        'state', null,
        'country', null,
        'postal_code', null,
        'district', null
      )
    end
  );
end;
$function$;

create or replace function public.submit_guest_checkin(
  p_token uuid,
  p_form_data jsonb,
  p_signature_data_url text,
  p_guest_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_checkin public.guest_checkins;
  v_reservation public.reservations;
  v_client_id uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_document_type text;
  v_document text;
  v_cpf text;
  v_birth_date date;
  v_profession text;
  v_gender text;
  v_civil_status text;
  v_city text;
  v_state text;
  v_country text;
  v_postal_code text;
  v_district text;
  v_reason text;
begin
  if p_form_data is null or jsonb_typeof(p_form_data) <> 'object' then
    raise exception 'Dados do formulário inválidos';
  end if;

  if pg_column_size(p_form_data) > 100000 then
    raise exception 'Formulário excede o tamanho permitido';
  end if;

  v_name := nullif(trim(p_form_data->>'nome_completo'), '');
  if coalesce(length(v_name), 0) < 3 then
    raise exception 'Informe o nome completo';
  end if;

  if p_guest_consent is not true then
    raise exception 'É necessário aceitar o tratamento dos dados para o check-in';
  end if;

  if p_signature_data_url is null
     or p_signature_data_url not like 'data:image/png;base64,%'
     or char_length(p_signature_data_url) > 500000 then
    raise exception 'Assinatura digital inválida';
  end if;

  select *
    into v_checkin
    from public.guest_checkins
   where public_token = p_token
     and status = 'enviado'
     and expires_at > now()
   for update;

  if v_checkin.id is null then
    raise exception 'Link inválido, expirado ou formulário já enviado';
  end if;

  select *
    into v_reservation
    from public.reservations
   where id = v_checkin.reservation_id
     and company_id = v_checkin.company_id;

  if v_reservation.id is null then
    raise exception 'Reserva vinculada não encontrada';
  end if;

  v_phone := nullif(trim(p_form_data->>'telefone'), '');
  v_email := nullif(lower(trim(p_form_data->>'email')), '');
  v_document_type := upper(coalesce(nullif(trim(p_form_data->>'tipo_documento'), ''), 'CPF'));
  v_document := nullif(trim(p_form_data->>'numero_documento'), '');
  v_cpf := case when v_document_type = 'CPF' then v_document else null end;
  v_birth_date := case
    when coalesce(p_form_data->>'nascimento', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (p_form_data->>'nascimento')::date
    else null
  end;
  v_profession := nullif(trim(p_form_data->>'profissao'), '');
  v_gender := nullif(lower(trim(p_form_data->>'genero')), '');
  v_civil_status := nullif(trim(p_form_data->>'estado_civil'), '');
  v_city := nullif(trim(p_form_data->>'cidade'), '');
  v_state := nullif(upper(trim(p_form_data->>'estado')), '');
  v_country := coalesce(nullif(trim(p_form_data->>'pais'), ''), 'Brasil');
  v_postal_code := nullif(trim(p_form_data->>'cep'), '');
  v_district := nullif(trim(p_form_data->>'bairro'), '');
  v_reason := nullif(trim(p_form_data->>'motivo_viagem'), '');

  v_client_id := coalesce(v_checkin.client_id, v_reservation.cliente_id);

  if v_client_id is null and v_cpf is not null then
    select c.id
      into v_client_id
      from public.clients c
     where c.company_id = v_checkin.company_id
       and regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g') = regexp_replace(v_cpf, '\D', '', 'g')
     order by c.created_at desc
     limit 1;
  end if;

  if v_client_id is null and v_phone is not null then
    select c.id
      into v_client_id
      from public.clients c
     where c.company_id = v_checkin.company_id
       and regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
     order by c.created_at desc
     limit 1;
  end if;

  if v_client_id is null then
    insert into public.clients (
      company_id, nome, tipo, telefone, email, cpf, documento,
      data_nascimento, profissao, sexo, estado_civil, cidade, estado,
      pais, cep, bairro, ativo
    ) values (
      v_checkin.company_id, v_name, 'hóspede normal', v_phone, v_email, v_cpf,
      case when v_document_type <> 'CPF' then v_document else null end,
      v_birth_date, v_profession, v_gender, v_civil_status, v_city, v_state,
      v_country, v_postal_code, v_district, true
    )
    returning id into v_client_id;
  else
    update public.clients
       set nome = coalesce(v_name, nome),
           telefone = coalesce(v_phone, telefone),
           email = coalesce(v_email, email),
           cpf = coalesce(v_cpf, cpf),
           documento = coalesce(case when v_document_type <> 'CPF' then v_document end, documento),
           data_nascimento = coalesce(v_birth_date, data_nascimento),
           profissao = coalesce(v_profession, profissao),
           sexo = coalesce(v_gender, sexo),
           estado_civil = coalesce(v_civil_status, estado_civil),
           cidade = coalesce(v_city, cidade),
           estado = coalesce(v_state, estado),
           pais = coalesce(v_country, pais),
           cep = coalesce(v_postal_code, cep),
           bairro = coalesce(v_district, bairro)
     where id = v_client_id
       and company_id = v_checkin.company_id;
  end if;

  update public.reservations
     set cliente_id = v_client_id,
         cliente_nome = v_name,
         motivo_estadia = coalesce(v_reason, motivo_estadia),
         updated_at = now()
   where id = v_reservation.id
     and company_id = v_checkin.company_id;

  update public.guest_checkins
     set client_id = v_client_id,
         form_data = p_form_data,
         signature_data_url = p_signature_data_url,
         guest_consent = true,
         status = 'preenchido',
         submitted_at = now(),
         expires_at = now(),
         updated_at = now()
   where id = v_checkin.id
     and status = 'enviado'
  returning * into v_checkin;

  if v_checkin.id is null then
    raise exception 'O formulário já foi enviado por outra sessão';
  end if;

  return jsonb_build_object(
    'id', v_checkin.id,
    'status', v_checkin.status,
    'submitted_at', v_checkin.submitted_at,
    'client_id', v_client_id,
    'public_access_closed', true,
    'public_print_window', false
  );
end;
$function$;
