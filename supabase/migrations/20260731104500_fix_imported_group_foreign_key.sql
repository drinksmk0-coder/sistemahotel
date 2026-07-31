create or replace function public.assign_imported_reservation_group()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_existing public.reservations;
  v_group_id uuid;
  v_group_company_id uuid;
  v_lock_key text;
begin
  if new.codigo_externo is null
     or trim(new.codigo_externo) = ''
     or lower(trim(coalesce(new.origem_importacao, ''))) not like 'hospedin%'
     or new.status in ('cancelado', 'manutencao') then
    return new;
  end if;

  v_lock_key := new.company_id::text || '|' || lower(trim(new.codigo_externo));
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  if new.group_id is not null then
    select reservation_group.company_id
      into v_group_company_id
      from public.reservation_groups as reservation_group
     where reservation_group.id = new.group_id
     for update;

    if v_group_company_id is not null
       and v_group_company_id <> new.company_id then
      raise exception 'O grupo informado pertence a outra empresa.';
    end if;

    if v_group_company_id is null then
      insert into public.reservation_groups (
        id,
        company_id,
        nome,
        responsavel_nome,
        checkin,
        checkout,
        canal,
        observacoes,
        status
      ) values (
        new.group_id,
        new.company_id,
        'Hospedin ' || trim(new.codigo_externo),
        new.cliente_nome,
        new.checkin,
        new.checkout,
        new.canal,
        'Grupo criado automaticamente durante a importação do Hospedin.',
        'ativo'
      );
    end if;

    return new;
  end if;

  select reservation.*
    into v_existing
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

  if v_existing.id is null then
    return new;
  end if;

  v_group_id := v_existing.group_id;
  if v_group_id is null then
    v_group_id := gen_random_uuid();

    insert into public.reservation_groups (
      id,
      company_id,
      nome,
      responsavel_nome,
      checkin,
      checkout,
      canal,
      observacoes,
      status
    ) values (
      v_group_id,
      new.company_id,
      'Hospedin ' || trim(new.codigo_externo),
      coalesce(nullif(trim(v_existing.cliente_nome), ''), new.cliente_nome),
      least(v_existing.checkin, new.checkin),
      greatest(v_existing.checkout, new.checkout),
      coalesce(v_existing.canal, new.canal),
      'Grupo criado automaticamente durante a importação do Hospedin.',
      'ativo'
    );

    update public.reservations
       set group_id = v_group_id,
           updated_at = now()
     where id = v_existing.id;
  end if;

  new.group_id := v_group_id;
  return new;
end;
$$;

revoke all on function public.assign_imported_reservation_group() from public, anon, authenticated;
