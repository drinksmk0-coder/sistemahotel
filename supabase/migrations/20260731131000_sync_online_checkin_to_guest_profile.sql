-- Ao enviar o check-in online, salva assinatura, atualiza o cadastro do titular
-- e cria a composição de hóspedes da reserva.

create or replace function public.submit_guest_checkin(
  p_token uuid,
  p_form_data jsonb,
  p_signature_data_url text,
  p_guest_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_checkin public.guest_checkins%rowtype;
  v_reservation public.reservations%rowtype;
  v_name text;
  v_phone text;
  v_email text;
  v_document text;
  v_birth date;
  v_companion_count integer;
  v_now timestamptz := now();
begin
  select * into v_checkin
  from public.guest_checkins
  where public_token = p_token
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Link de check-in inválido.';
  end if;

  if v_checkin.status not in ('enviado', 'preenchido') then
    raise exception using errcode = '22023', message = 'Esta ficha não está disponível para preenchimento.';
  end if;

  if not coalesce(p_guest_consent, false) then
    raise exception using errcode = '22023', message = 'É necessário aceitar o tratamento dos dados.';
  end if;

  if nullif(trim(coalesce(p_signature_data_url, '')), '') is null then
    raise exception using errcode = '22023', message = 'A assinatura do hóspede é obrigatória.';
  end if;

  v_name := nullif(trim(p_form_data ->> 'nome_completo'), '');
  v_phone := nullif(trim(p_form_data ->> 'telefone'), '');
  v_email := nullif(trim(p_form_data ->> 'email'), '');
  v_document := nullif(trim(p_form_data ->> 'numero_documento'), '');
  v_birth := nullif(p_form_data ->> 'nascimento', '')::date;

  if v_name is null then
    raise exception using errcode = '22023', message = 'Informe o nome completo do hóspede.';
  end if;

  update public.guest_checkins
     set form_data = coalesce(p_form_data, '{}'::jsonb),
         signature_data_url = p_signature_data_url,
         guest_consent = true,
         status = 'preenchido',
         submitted_at = v_now
   where id = v_checkin.id;

  select * into v_reservation
  from public.reservations
  where id = v_checkin.reservation_id
  for update;

  if found then
    update public.reservations
       set cliente_nome = v_name,
           guest_signature = p_signature_data_url,
           guest_signature_at = v_now,
           guest_terms_accepted = true,
           guest_terms_accepted_at = v_now
     where id = v_reservation.id;

    if v_reservation.cliente_id is not null then
      update public.clients
         set nome = v_name,
             telefone = coalesce(v_phone, telefone),
             email = coalesce(v_email, email),
             cpf = case
               when upper(coalesce(p_form_data ->> 'tipo_documento', 'CPF')) = 'CPF'
                 then coalesce(v_document, cpf)
               else cpf
             end,
             data_nascimento = coalesce(v_birth, data_nascimento),
             profissao = coalesce(nullif(trim(p_form_data ->> 'profissao'), ''), profissao),
             sexo = coalesce(nullif(trim(p_form_data ->> 'genero'), ''), sexo),
             cidade = coalesce(nullif(trim(p_form_data ->> 'cidade'), ''), cidade),
             estado = coalesce(nullif(trim(p_form_data ->> 'estado'), ''), estado),
             cep = coalesce(nullif(trim(p_form_data ->> 'cep'), ''), cep),
             bairro = coalesce(nullif(trim(p_form_data ->> 'bairro'), ''), bairro),
             updated_from_checkin_at = v_now
       where id = v_reservation.cliente_id
         and company_id = v_reservation.company_id;
    end if;

    delete from public.reservation_guests
    where reservation_id = v_reservation.id;

    insert into public.reservation_guests (
      company_id,
      reservation_id,
      client_id,
      nome,
      cpf,
      telefone,
      email,
      data_nascimento,
      sexo,
      parentesco,
      titular
    ) values (
      v_reservation.company_id,
      v_reservation.id,
      v_reservation.cliente_id,
      v_name,
      case
        when upper(coalesce(p_form_data ->> 'tipo_documento', 'CPF')) = 'CPF' then v_document
        else null
      end,
      v_phone,
      v_email,
      v_birth,
      nullif(trim(p_form_data ->> 'genero'), ''),
      'titular',
      true
    );

    -- Compatibilidade com o formulário atual, que informa somente a quantidade.
    v_companion_count := greatest(
      0,
      coalesce(nullif(regexp_replace(coalesce(p_form_data ->> 'acompanhantes', '0'), '\D', '', 'g'), '')::integer, 0)
    );

    update public.reservations
       set pessoas = greatest(1, v_companion_count + 1)
     where id = v_reservation.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'checkin_id', v_checkin.id,
    'reservation_id', v_checkin.reservation_id,
    'submitted_at', v_now,
    'profile_updated', v_reservation.cliente_id is not null
  );
end;
$$;

revoke all on function public.submit_guest_checkin(uuid, jsonb, text, boolean) from public;
grant execute on function public.submit_guest_checkin(uuid, jsonb, text, boolean) to anon, authenticated;
