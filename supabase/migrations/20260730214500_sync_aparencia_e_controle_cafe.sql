create table if not exists public.company_ui_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.company_ui_settings enable row level security;

drop policy if exists company_ui_settings_member_select on public.company_ui_settings;
create policy company_ui_settings_member_select
on public.company_ui_settings
for select
to authenticated
using (
  public.is_company_member(company_id, (select auth.uid()))
  or public.is_platform_admin((select auth.uid()))
);

drop policy if exists company_ui_settings_owner_insert on public.company_ui_settings;
create policy company_ui_settings_owner_insert
on public.company_ui_settings
for insert
to authenticated
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or public.is_platform_admin((select auth.uid()))
);

drop policy if exists company_ui_settings_owner_update on public.company_ui_settings;
create policy company_ui_settings_owner_update
on public.company_ui_settings
for update
to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or public.is_platform_admin((select auth.uid()))
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or public.is_platform_admin((select auth.uid()))
);

create table if not exists public.breakfast_attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  service_date date not null,
  expected_guests integer not null default 0 check (expected_guests >= 0),
  served_guests integer not null default 0 check (served_guests >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, reservation_id, service_date),
  check (served_guests <= expected_guests)
);

create index if not exists breakfast_attendance_company_date_idx
  on public.breakfast_attendance(company_id, service_date);

alter table public.breakfast_attendance enable row level security;

-- A tabela não é exposta diretamente ao navegador. Leitura e alteração passam
-- pelos RPCs abaixo, que retornam somente contagens operacionais.
revoke all on public.breakfast_attendance from anon, authenticated;

drop function if exists public.get_operational_room_board(uuid, date);
create function public.get_operational_room_board(
  p_company_id uuid,
  p_date date default current_date
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
      when r.situacao = 'limpeza' then 'limpeza'
      when active_res.id is not null and active_res.checkin = p_date and active_res.status <> 'ocupado' then 'reservado'
      when active_res.id is not null then 'ocupado'
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
      and rs.checkin <= p_date
      and rs.checkout > p_date
    order by rs.checkin desc, rs.created_at desc
    limit 1
  ) active_res on true
  left join lateral (
    select rs.id
    from public.reservations rs
    where rs.company_id = p_company_id
      and rs.quarto = r.numero
      and rs.status not in ('cancelado', 'manutencao')
      and rs.checkout = p_date
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

create or replace function public.set_breakfast_served(
  p_company_id uuid,
  p_reservation_id uuid,
  p_service_date date,
  p_served_guests integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  expected integer;
begin
  if not (
    public.has_company_role(p_company_id, auth.uid(), 'dono'::public.app_role)
    or public.has_company_role(p_company_id, auth.uid(), 'recepcao'::public.app_role)
    or public.has_company_role(p_company_id, auth.uid(), 'cafe'::public.app_role)
  ) then
    raise exception using errcode = '42501', message = 'Função não autorizada para controlar o café.';
  end if;

  select greatest(coalesce(r.pessoas, 0), 0)
    into expected
  from public.reservations r
  where r.id = p_reservation_id
    and r.company_id = p_company_id
    and r.status not in ('cancelado', 'manutencao')
    and r.checkin < p_service_date
    and r.checkout >= p_service_date;

  if not found then
    raise exception using errcode = 'P0002', message = 'Hospedagem não encontrada para o café desta data.';
  end if;

  if p_served_guests < 0 or p_served_guests > expected then
    raise exception using errcode = '22023', message = 'Quantidade de cafés fora do limite de hóspedes.';
  end if;

  insert into public.breakfast_attendance (
    company_id,
    reservation_id,
    service_date,
    expected_guests,
    served_guests,
    updated_by,
    updated_at
  ) values (
    p_company_id,
    p_reservation_id,
    p_service_date,
    expected,
    p_served_guests,
    auth.uid(),
    now()
  )
  on conflict (company_id, reservation_id, service_date)
  do update set
    expected_guests = excluded.expected_guests,
    served_guests = excluded.served_guests,
    updated_by = excluded.updated_by,
    updated_at = now();
end;
$$;

grant execute on function public.get_operational_room_board(uuid, date) to authenticated;
grant execute on function public.set_breakfast_served(uuid, uuid, date, integer) to authenticated;
