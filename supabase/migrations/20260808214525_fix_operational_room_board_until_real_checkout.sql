create or replace function public.get_operational_room_board(
  p_company_id uuid,
  p_date date default public.hotel_operational_date(now())
)
returns table(
  numero integer,
  andar integer,
  configuracao text,
  situacao text,
  frigobar boolean,
  tv_smart boolean,
  vista text,
  nivel_ruido text,
  ventilacao text,
  tamanho_banheiro text,
  prioridade_venda smallint,
  ocupacao_status text,
  pessoas integer,
  checkin date,
  checkout date,
  breakfast_reservation_id uuid,
  breakfast_guests integer,
  breakfast_served integer,
  breakfast_remaining integer,
  ocorrencias_ativas bigint,
  principal_ocorrencia text
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_today date := public.hotel_operational_date(now());
begin
  if not public.is_company_member(p_company_id, auth.uid()) then
    raise exception using errcode = '42501', message = 'Acesso negado à empresa.';
  end if;

  return query
  select
    r.numero,
    r.andar,
    r.configuracao,
    r.situacao,
    coalesce(r.frigobar, false),
    coalesce(r.tv_smart, false),
    r.vista,
    r.nivel_ruido,
    r.ventilacao,
    r.tamanho_banheiro,
    r.prioridade_venda,
    case
      when r.situacao = 'manutencao' then 'manutencao'
      when active_res.id is not null and active_res.checkin = p_date and active_res.status = 'reservado' then 'reservado'
      when active_res.id is not null then 'ocupado'
      when r.situacao = 'limpeza' then 'limpeza'
      when checkout_res.id is not null then 'limpeza'
      else 'livre'
    end as ocupacao_status,
    coalesce(active_res.pessoas, 0),
    active_res.checkin,
    active_res.checkout,
    breakfast_res.id,
    coalesce(breakfast_res.pessoas, 0),
    least(
      coalesce(att.served_guests, 0),
      greatest(coalesce(breakfast_res.pessoas, 0), 0)
    )::integer,
    greatest(
      greatest(coalesce(breakfast_res.pessoas, 0), 0) - coalesce(att.served_guests, 0),
      0
    )::integer,
    coalesce(occ.total, 0),
    occ.principal
  from public.rooms r
  left join lateral (
    select rs.id, rs.checkin, rs.checkout, rs.pessoas, rs.status
    from public.reservations rs
    where rs.company_id = p_company_id
      and rs.quarto = r.numero
      and rs.status not in ('cancelado', 'finalizado', 'manutencao')
      and (
        (
          p_date = v_today
          and rs.status in ('ocupado', 'saida_pendente')
          and rs.checkout_at is null
          and rs.presence_status in ('no_hotel', 'hospedado', 'presente')
        )
        or (
          rs.checkin <= p_date
          and rs.checkout > p_date
        )
      )
    order by
      case when rs.status in ('ocupado', 'saida_pendente') then 0 else 1 end,
      rs.checkin desc,
      rs.created_at desc
    limit 1
  ) active_res on true
  left join lateral (
    select rs.id
    from public.reservations rs
    where rs.company_id = p_company_id
      and rs.quarto = r.numero
      and rs.status not in ('cancelado', 'manutencao')
      and rs.checkout = p_date
      and (
        p_date <> v_today
        or rs.status = 'finalizado'
        or rs.checkout_at is not null
        or rs.presence_status = 'checkout'
      )
    order by rs.created_at desc
    limit 1
  ) checkout_res on true
  left join lateral (
    select rs.id, rs.pessoas
    from public.reservations rs
    where rs.company_id = p_company_id
      and rs.quarto = r.numero
      and rs.status not in ('cancelado', 'manutencao')
      and rs.checkin < p_date
      and rs.checkout >= p_date
      and not (
        p_date = v_today
        and (rs.status = 'finalizado' or rs.checkout_at is not null or rs.presence_status = 'checkout')
      )
    order by rs.checkin desc, rs.created_at desc
    limit 1
  ) breakfast_res on true
  left join public.breakfast_attendance att
    on att.company_id = p_company_id
   and att.reservation_id = breakfast_res.id
   and att.service_date = p_date
  left join lateral (
    select
      count(*)::bigint as total,
      min(c.categoria) as principal
    from public.complaints c
    where c.company_id = p_company_id
      and c.quarto = r.numero
      and c.status <> 'resolvido'
  ) occ on true
  where r.company_id = p_company_id
  order by r.andar, r.numero;
end;
$$;

revoke all on function public.get_operational_room_board(uuid,date) from public;
grant execute on function public.get_operational_room_board(uuid,date) to authenticated;
