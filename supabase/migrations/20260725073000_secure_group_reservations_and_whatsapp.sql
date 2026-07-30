-- Keep group creation atomic and prevent overlapping reservations created concurrently.
create or replace function public.prevent_reservation_overlap()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status in ('cancelado', 'finalizado') then
    return new;
  end if;

  -- Every reservation write for a room uses the same transaction lock.
  perform pg_advisory_xact_lock(
    hashtextextended(new.company_id::text || ':' || new.quarto::text, 0)
  );

  if exists (
    select 1
    from public.reservations existing
    where existing.company_id = new.company_id
      and existing.quarto = new.quarto
      and existing.id <> new.id
      and existing.status not in ('cancelado', 'finalizado')
      and existing.checkin < new.checkout
      and existing.checkout > new.checkin
  ) then
    raise exception 'O quarto % não está disponível nesse período.', new.quarto;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_prevent_overlap on public.reservations;
create trigger reservations_prevent_overlap
before insert or update of company_id, quarto, checkin, checkout, status
on public.reservations
for each row execute function public.prevent_reservation_overlap();

create or replace function public.create_group_reservation(
  p_group jsonb,
  p_reservations jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company_id uuid := (p_group ->> 'company_id')::uuid;
  v_group_id uuid;
begin
  if v_company_id is null then
    raise exception 'Empresa não informada.';
  end if;

  if not (
    public.has_company_role(v_company_id, (select auth.uid()), 'dono'::public.app_role)
    or public.has_company_role(v_company_id, (select auth.uid()), 'recepcao'::public.app_role)
  ) then
    raise exception 'Sem permissão para criar reservas em grupo.';
  end if;

  if jsonb_typeof(p_reservations) <> 'array' or jsonb_array_length(p_reservations) = 0 then
    raise exception 'Informe ao menos um quarto para o grupo.';
  end if;

  -- Serializes availability checks for the same company until this transaction finishes.
  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text, 0));

  if exists (
    select 1
    from jsonb_to_recordset(p_reservations) as requested(
      quarto integer,
      checkin date,
      checkout date
    )
    group by requested.quarto
    having count(*) > 1
  ) then
    raise exception 'O mesmo quarto foi informado mais de uma vez.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_reservations) as requested(
      quarto integer,
      checkin date,
      checkout date
    )
    where requested.checkout <= requested.checkin
  ) then
    raise exception 'O período da reserva é inválido.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_reservations) as requested(
      quarto integer,
      checkin date,
      checkout date
    )
    join public.reservations existing
      on existing.company_id = v_company_id
     and existing.quarto = requested.quarto
     and existing.status not in ('cancelado', 'finalizado')
     and existing.checkin < requested.checkout
     and existing.checkout > requested.checkin
  ) then
    raise exception 'Um ou mais quartos não estão disponíveis no período.';
  end if;

  insert into public.reservation_groups (
    company_id,
    nome,
    responsavel_nome,
    responsavel_telefone,
    checkin,
    checkout,
    canal,
    observacoes,
    status
  )
  values (
    v_company_id,
    p_group ->> 'nome',
    p_group ->> 'responsavel_nome',
    nullif(p_group ->> 'responsavel_telefone', ''),
    (p_group ->> 'checkin')::date,
    (p_group ->> 'checkout')::date,
    nullif(p_group ->> 'canal', ''),
    nullif(p_group ->> 'observacoes', ''),
    coalesce(nullif(p_group ->> 'status', ''), 'ativo')
  )
  returning id into v_group_id;

  insert into public.reservations (
    company_id,
    group_id,
    quarto,
    cliente_id,
    cliente_nome,
    checkin,
    checkout,
    diarias,
    valor_diaria,
    valor_total,
    valor_pago,
    desconto,
    pessoas,
    canal,
    pagamento,
    pago,
    status
  )
  select
    v_company_id,
    v_group_id,
    reservation.quarto,
    reservation.cliente_id,
    reservation.cliente_nome,
    reservation.checkin,
    reservation.checkout,
    reservation.diarias,
    reservation.valor_diaria,
    reservation.valor_total,
    reservation.valor_pago,
    reservation.desconto,
    reservation.pessoas,
    reservation.canal,
    reservation.pagamento,
    reservation.pago,
    reservation.status
  from jsonb_to_recordset(p_reservations) as reservation(
    quarto integer,
    cliente_id uuid,
    cliente_nome text,
    checkin date,
    checkout date,
    diarias integer,
    valor_diaria numeric,
    valor_total numeric,
    valor_pago numeric,
    desconto numeric,
    pessoas integer,
    canal text,
    pagamento text,
    pago boolean,
    status text
  );

  return v_group_id;
end;
$$;

revoke all on function public.create_group_reservation(jsonb, jsonb) from public, anon;
grant execute on function public.create_group_reservation(jsonb, jsonb) to authenticated;

-- Read access remains available to company members, while writes are restricted.
drop policy if exists reservation_groups_company_all on public.reservation_groups;
drop policy if exists reservation_groups_company_select on public.reservation_groups;
drop policy if exists reservation_groups_staff_insert on public.reservation_groups;
drop policy if exists reservation_groups_staff_update on public.reservation_groups;
drop policy if exists reservation_groups_staff_delete on public.reservation_groups;

create policy reservation_groups_company_select
on public.reservation_groups
for select
to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

create policy reservation_groups_staff_insert
on public.reservation_groups
for insert
to authenticated
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao'::public.app_role)
);

create policy reservation_groups_staff_update
on public.reservation_groups
for update
to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao'::public.app_role)
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao'::public.app_role)
);

create policy reservation_groups_staff_delete
on public.reservation_groups
for delete
to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role)
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao'::public.app_role)
);

-- Protect WhatsApp sessions through the regular migration workflow.
alter table public.whatsapp_reservation_sessions enable row level security;

drop policy if exists whatsapp_reservation_sessions_staff_select
on public.whatsapp_reservation_sessions;

drop policy if exists whatsapp_sessions_company_select
on public.whatsapp_reservation_sessions;

create policy whatsapp_sessions_company_select
on public.whatsapp_reservation_sessions
for select
to authenticated
using (
  company_id is not null
  and public.is_company_member(company_id, (select auth.uid()))
);

revoke all on public.whatsapp_reservation_sessions from anon;
revoke insert, update, delete on public.whatsapp_reservation_sessions from authenticated;
grant select on public.whatsapp_reservation_sessions to authenticated;
grant all on public.whatsapp_reservation_sessions to service_role;
