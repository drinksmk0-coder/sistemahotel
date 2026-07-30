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
as $$
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
     and status in ('enviado', 'preenchido')
   for update;

  if v_checkin.id is null then
    raise exception 'Link inválido ou formulário já encerrado';
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
      company_id,
      nome,
      tipo,
      telefone,
      email,
      cpf,
      documento,
      data_nascimento,
      profissao,
      sexo,
      cidade,
      estado,
      pais,
      cep,
      bairro,
      ativo
    ) values (
      v_checkin.company_id,
      v_name,
      'hóspede normal',
      v_phone,
      v_email,
      v_cpf,
      case when v_document_type <> 'CPF' then v_document else null end,
      v_birth_date,
      v_profession,
      v_gender,
      v_city,
      v_state,
      v_country,
      v_postal_code,
      v_district,
      true
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
   where id = v_reservation.id;

  update public.guest_checkins
     set client_id = v_client_id,
         form_data = p_form_data,
         signature_data_url = p_signature_data_url,
         guest_consent = true,
         status = 'preenchido',
         submitted_at = now(),
         updated_at = now()
   where id = v_checkin.id
  returning * into v_checkin;

  return jsonb_build_object(
    'id', v_checkin.id,
    'status', v_checkin.status,
    'submitted_at', v_checkin.submitted_at,
    'client_id', v_client_id
  );
end;
$$;

-- Recupera automaticamente fichas já enviadas antes desta correção.
update public.guest_checkins gc
   set client_id = coalesce(gc.client_id, r.cliente_id),
       updated_at = now()
  from public.reservations r
 where r.id = gc.reservation_id
   and gc.status = 'preenchido'
   and gc.client_id is null
   and r.cliente_id is not null;

update public.clients c
   set nome = coalesce(nullif(trim(gc.form_data->>'nome_completo'), ''), c.nome),
       telefone = coalesce(nullif(trim(gc.form_data->>'telefone'), ''), c.telefone),
       email = coalesce(nullif(lower(trim(gc.form_data->>'email')), ''), c.email),
       cpf = coalesce(
         case
           when upper(coalesce(gc.form_data->>'tipo_documento', 'CPF')) = 'CPF'
             then nullif(trim(gc.form_data->>'numero_documento'), '')
         end,
         c.cpf
       ),
       documento = coalesce(
         case
           when upper(coalesce(gc.form_data->>'tipo_documento', 'CPF')) <> 'CPF'
             then nullif(trim(gc.form_data->>'numero_documento'), '')
         end,
         c.documento
       ),
       data_nascimento = coalesce(
         case
           when coalesce(gc.form_data->>'nascimento', '') ~ '^\d{4}-\d{2}-\d{2}$'
             then (gc.form_data->>'nascimento')::date
         end,
         c.data_nascimento
       ),
       profissao = coalesce(nullif(trim(gc.form_data->>'profissao'), ''), c.profissao),
       sexo = coalesce(nullif(lower(trim(gc.form_data->>'genero')), ''), c.sexo),
       cidade = coalesce(nullif(trim(gc.form_data->>'cidade'), ''), c.cidade),
       estado = coalesce(nullif(upper(trim(gc.form_data->>'estado')), ''), c.estado),
       pais = coalesce(nullif(trim(gc.form_data->>'pais'), ''), c.pais),
       cep = coalesce(nullif(trim(gc.form_data->>'cep'), ''), c.cep),
       bairro = coalesce(nullif(trim(gc.form_data->>'bairro'), ''), c.bairro)
  from public.guest_checkins gc
 where gc.client_id = c.id
   and gc.company_id = c.company_id
   and gc.status = 'preenchido';

update public.reservations r
   set cliente_nome = coalesce(nullif(trim(gc.form_data->>'nome_completo'), ''), r.cliente_nome),
       motivo_estadia = coalesce(nullif(trim(gc.form_data->>'motivo_viagem'), ''), r.motivo_estadia),
       updated_at = now()
  from public.guest_checkins gc
 where gc.reservation_id = r.id
   and gc.status = 'preenchido';
