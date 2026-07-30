-- Restringe dados sensíveis por função e cria um quadro operacional sem nomes ou valores.

drop policy if exists company_integrations_staff_all on public.company_integrations;
create policy company_integrations_owner_select on public.company_integrations for select to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role));
create policy company_integrations_owner_insert on public.company_integrations for insert to authenticated with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role));
create policy company_integrations_owner_update on public.company_integrations for update to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role)) with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role));
create policy company_integrations_owner_delete on public.company_integrations for delete to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role));

drop policy if exists reservations_company_all on public.reservations;
create policy reservations_owner_reception_select on public.reservations for select to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy reservations_owner_reception_insert on public.reservations for insert to authenticated with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy reservations_owner_reception_update on public.reservations for update to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role)) with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy reservations_owner_reception_delete on public.reservations for delete to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));

drop policy if exists clients_company_insert on public.clients;
drop policy if exists clients_company_select on public.clients;
drop policy if exists clients_company_update on public.clients;
create policy clients_owner_reception_select on public.clients for select to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy clients_owner_reception_insert on public.clients for insert to authenticated with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy clients_owner_reception_update on public.clients for update to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role)) with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));

drop policy if exists sales_company_all on public.sales;
create policy sales_owner_reception_select on public.sales for select to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy sales_owner_reception_insert on public.sales for insert to authenticated with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy sales_owner_reception_update on public.sales for update to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role)) with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy sales_owner_reception_delete on public.sales for delete to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));

drop policy if exists complaints_company_staff_all on public.complaints;
create policy complaints_owner_reception_select on public.complaints for select to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy complaints_owner_reception_insert on public.complaints for insert to authenticated with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy complaints_owner_reception_update on public.complaints for update to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role)) with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy complaints_owner_reception_delete on public.complaints for delete to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));

drop policy if exists guest_checkins_company_insert on public.guest_checkins;
drop policy if exists guest_checkins_company_select on public.guest_checkins;
drop policy if exists guest_checkins_company_update on public.guest_checkins;
create policy guest_checkins_owner_reception_select on public.guest_checkins for select to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy guest_checkins_owner_reception_insert on public.guest_checkins for insert to authenticated with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy guest_checkins_owner_reception_update on public.guest_checkins for update to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role)) with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));

drop policy if exists rooms_company_write on public.rooms;
create policy rooms_owner_reception_insert on public.rooms for insert to authenticated with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy rooms_owner_reception_update on public.rooms for update to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role)) with check (has_company_role(company_id, (select auth.uid()), 'dono'::app_role) or has_company_role(company_id, (select auth.uid()), 'recepcao'::app_role));
create policy rooms_owner_reception_delete on public.rooms for delete to authenticated using (has_company_role(company_id, (select auth.uid()), 'dono'::app_role));

drop policy if exists company_members_member_select on public.company_members;
create policy company_members_self_or_owner_select on public.company_members for select to authenticated using (user_id = (select auth.uid()) or has_company_role(company_id, (select auth.uid()), 'dono'::app_role));

create or replace function public.get_operational_room_board(p_company_id uuid, p_date date default current_date)
returns table (
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
  ocorrencias_ativas bigint,
  principal_ocorrencia text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_company_member(p_company_id, auth.uid()) then
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
    end,
    coalesce(active_res.pessoas, 0),
    active_res.checkin,
    active_res.checkout,
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
    limit 1
  ) checkout_res on true
  left join lateral (
    select count(*)::bigint as total, min(c.categoria) as principal
    from public.complaints c
    where c.company_id = p_company_id
      and c.quarto = r.numero
      and c.status <> 'resolvido'
  ) occ on true
  where r.company_id = p_company_id
  order by r.andar, r.numero;
end;
$$;

revoke all on function public.get_operational_room_board(uuid, date) from public;
grant execute on function public.get_operational_room_board(uuid, date) to authenticated;

create or replace function public.set_operational_room_status(p_company_id uuid, p_room_number integer, p_status text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (
    has_company_role(p_company_id, auth.uid(), 'dono'::app_role)
    or has_company_role(p_company_id, auth.uid(), 'recepcao'::app_role)
    or has_company_role(p_company_id, auth.uid(), 'limpeza'::app_role)
  ) then
    raise exception using errcode = '42501', message = 'Função não autorizada para alterar o quarto.';
  end if;

  if p_status is not null and p_status not in ('limpeza', 'manutencao') then
    raise exception using errcode = '22023', message = 'Situação operacional inválida.';
  end if;

  update public.rooms set situacao = p_status
  where company_id = p_company_id and numero = p_room_number;

  if not found then
    raise exception using errcode = 'P0002', message = 'Quarto não encontrado.';
  end if;
end;
$$;

revoke all on function public.set_operational_room_status(uuid, integer, text) from public;
grant execute on function public.set_operational_room_status(uuid, integer, text) to authenticated;

comment on function public.get_operational_room_board(uuid, date) is 'Quadro operacional sem nomes, documentos, pagamentos ou valores para Governança e Café.';
comment on function public.set_operational_room_status(uuid, integer, text) is 'Permite que Governança altere somente limpeza/manutenção sem acesso direto às reservas.';
