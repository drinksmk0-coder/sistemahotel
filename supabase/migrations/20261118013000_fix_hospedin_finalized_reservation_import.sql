create or replace function public.prevent_duplicate_individual_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_duplicate public.reservations;
  v_hospedin_history boolean;
begin
  if new.group_id is not null
     or new.status in ('cancelado', 'manutencao') then
    return new;
  end if;

  -- Closed source stays in separate UHs can share a booking contact.
  -- Only a past, finalized API insert with a unit-level external ID qualifies.
  v_hospedin_history := coalesce(
    tg_op = 'INSERT'
    and new.status = 'finalizado'
    and new.checkout < (now() at time zone 'America/Sao_Paulo')::date
    and lower(trim(coalesce(new.origem_importacao, ''))) = 'hospedin api'
    and lower(trim(coalesce(new.codigo_externo, ''))) ~ '^hospedin:[^:[:space:]]+:[0-9]+$',
    false
  );

  select r.*
    into v_duplicate
    from public.reservations r
   where r.company_id = new.company_id
     and r.id <> coalesce(new.id, gen_random_uuid())
     and r.group_id is null
     and (not v_hospedin_history or r.quarto = new.quarto)
     and r.status not in ('cancelado', 'manutencao')
     and new.checkin < r.checkout
     and new.checkout > r.checkin
     and (
       (new.cliente_id is not null and r.cliente_id = new.cliente_id)
       or (
         new.cliente_id is null
         and lower(trim(r.cliente_nome)) = lower(trim(new.cliente_nome))
       )
     )
   order by r.created_at desc
   limit 1;

  if v_duplicate.id is not null then
    raise exception using
      errcode = '23505',
      message = format(
        'Já existe uma reserva individual ativa para %s entre %s e %s. Use Reserva em grupo quando a mesma pessoa for responsável por mais de um quarto.',
        v_duplicate.cliente_nome,
        to_char(v_duplicate.checkin, 'DD/MM/YYYY'),
        to_char(v_duplicate.checkout, 'DD/MM/YYYY')
      );
  end if;

  return new;
end;
$$;
