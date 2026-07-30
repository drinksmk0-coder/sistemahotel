create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

drop policy if exists platform_admins_self_select on public.platform_admins;
create policy platform_admins_self_select
on public.platform_admins
for select
to authenticated
using (user_id = (select auth.uid()) and ativo = true);

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = p_user_id
      and pa.ativo = true
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated;

insert into public.platform_admins (user_id, ativo)
select u.id, true
from auth.users u
where lower(u.email) = lower('drinksmk0@gmail.com')
on conflict (user_id) do update set ativo = excluded.ativo;

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_path text,
  session_count integer not null default 0 check (session_count >= 0),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists user_activity_company_last_seen_idx
  on public.user_activity (company_id, last_seen_at desc);

alter table public.user_activity enable row level security;

drop policy if exists user_activity_self_select on public.user_activity;
drop policy if exists user_activity_admin_select on public.user_activity;
drop policy if exists user_activity_self_insert on public.user_activity;
drop policy if exists user_activity_self_update on public.user_activity;

create policy user_activity_self_select
on public.user_activity
for select
to authenticated
using (user_id = (select auth.uid()));

create policy user_activity_admin_select
on public.user_activity
for select
to authenticated
using (public.is_platform_admin((select auth.uid())));

create policy user_activity_self_insert
on public.user_activity
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_company_member(company_id, (select auth.uid()))
);

create policy user_activity_self_update
on public.user_activity
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and public.is_company_member(company_id, (select auth.uid()))
);

create or replace function public.record_user_activity(
  p_company_id uuid,
  p_path text,
  p_new_session boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role;
  v_path text;
begin
  select cm.role
    into v_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = auth.uid()
    and cm.ativo = true
  limit 1;

  if v_role is null then
    raise exception using errcode = '42501', message = 'Usuário sem vínculo ativo com a empresa.';
  end if;

  v_path := left(coalesce(nullif(trim(p_path), ''), '/'), 180);

  insert into public.user_activity (
    company_id,
    user_id,
    role,
    first_seen_at,
    last_seen_at,
    last_path,
    session_count,
    updated_at
  )
  values (
    p_company_id,
    auth.uid(),
    v_role,
    now(),
    now(),
    v_path,
    case when p_new_session then 1 else 0 end,
    now()
  )
  on conflict (company_id, user_id)
  do update set
    role = excluded.role,
    last_seen_at = now(),
    last_path = excluded.last_path,
    session_count = public.user_activity.session_count + case when p_new_session then 1 else 0 end,
    updated_at = now();
end;
$$;

revoke all on function public.record_user_activity(uuid, text, boolean) from public;
grant execute on function public.record_user_activity(uuid, text, boolean) to authenticated;

create or replace function public.platform_admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'Acesso exclusivo do administrador da HospedaMais.';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'companies', coalesce(jsonb_agg(company_row order by company_row ->> 'name'), '[]'::jsonb)
  )
  into v_result
  from (
    select jsonb_build_object(
      'id', c.id,
      'name', c.nome,
      'active', c.ativo,
      'created_at', c.created_at,
      'setup', jsonb_build_object(
        'company_fields_completed',
          (case when nullif(trim(c.documento), '') is not null then 1 else 0 end) +
          (case when nullif(trim(c.telefone), '') is not null or nullif(trim(c.whatsapp), '') is not null then 1 else 0 end) +
          (case when nullif(trim(c.email), '') is not null then 1 else 0 end) +
          (case when nullif(trim(c.endereco), '') is not null then 1 else 0 end) +
          (case when nullif(trim(c.cidade), '') is not null then 1 else 0 end) +
          (case when nullif(trim(c.estado), '') is not null then 1 else 0 end),
        'company_fields_total', 6,
        'rooms_total', (select count(*) from public.rooms r where r.company_id = c.id),
        'rooms_profiled', (
          select count(*)
          from public.rooms r
          where r.company_id = c.id
            and (
              r.frigobar = true
              or r.tv_smart = true
              or r.vista is not null
              or r.nivel_ruido is not null
              or r.ventilacao is not null
              or r.tamanho_banheiro is not null
              or r.prioridade_venda is not null
              or nullif(trim(r.observacoes_quarto), '') is not null
            )
        ),
        'booking_status', coalesce((
          select case
            when ci.ativo then 'active'
            else coalesce(ci.configuracao ->> 'connection_status', 'inactive')
          end
          from public.company_integrations ci
          where ci.company_id = c.id and ci.tipo = 'booking'
          limit 1
        ), 'not_configured')
      ),
      'usage', jsonb_build_object(
        'members_total', (select count(*) from public.company_members cm where cm.company_id = c.id),
        'members_active', (select count(*) from public.company_members cm where cm.company_id = c.id and cm.ativo = true),
        'active_last_7_days', (
          select count(*)
          from public.user_activity ua
          where ua.company_id = c.id
            and ua.last_seen_at >= now() - interval '7 days'
        ),
        'reservations_total', (select count(*) from public.reservations rs where rs.company_id = c.id),
        'last_reservation_at', (select max(rs.updated_at) from public.reservations rs where rs.company_id = c.id),
        'sales_total', (select count(*) from public.sales s where s.company_id = c.id),
        'expenses_total', (select count(*) from public.expenses e where e.company_id = c.id)
      ),
      'members', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'membership_id', cm.id,
            'user_id', cm.user_id,
            'name', coalesce(nullif(trim(p.nome), ''), split_part(coalesce(p.email, au.email, ''), '@', 1)),
            'email', coalesce(p.email, au.email),
            'role', cm.role,
            'active', cm.ativo,
            'is_platform_admin', public.is_platform_admin(cm.user_id),
            'first_seen_at', ua.first_seen_at,
            'last_seen_at', ua.last_seen_at,
            'last_path', ua.last_path,
            'session_count', coalesce(ua.session_count, 0)
          )
          order by case cm.role
            when 'dono' then 1
            when 'recepcao' then 2
            when 'limpeza' then 3
            when 'cafe' then 4
            else 9
          end,
          coalesce(p.nome, au.email)
        )
        from public.company_members cm
        left join public.profiles p on p.id = cm.user_id
        left join auth.users au on au.id = cm.user_id
        left join public.user_activity ua
          on ua.company_id = cm.company_id and ua.user_id = cm.user_id
        where cm.company_id = c.id
      ), '[]'::jsonb),
      'pending_invites', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'email', ci.email,
            'name', ci.nome,
            'role', ci.role,
            'status', ci.status,
            'created_at', ci.created_at
          )
          order by ci.created_at desc
        )
        from public.company_invites ci
        where ci.company_id = c.id
          and ci.status not in ('aceito', 'cancelado')
      ), '[]'::jsonb)
    ) as company_row
    from public.companies c
  ) rows;

  return coalesce(v_result, jsonb_build_object('generated_at', now(), 'companies', '[]'::jsonb));
end;
$$;

revoke all on function public.platform_admin_overview() from public;
grant execute on function public.platform_admin_overview() to authenticated;

create or replace function public.protect_platform_admin_membership()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = old.user_id
      and pa.ativo = true
  ) then
    if tg_op = 'DELETE' then
      raise exception using errcode = '42501', message = 'O administrador da HospedaMais não pode ser removido pela equipe do hotel.';
    end if;

    if new.ativo = false or new.role <> 'dono'::public.app_role then
      raise exception using errcode = '42501', message = 'O acesso administrativo da HospedaMais não pode ser desativado ou rebaixado.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_platform_admin_membership_trigger on public.company_members;
create trigger protect_platform_admin_membership_trigger
before update or delete on public.company_members
for each row
execute function public.protect_platform_admin_membership();

comment on table public.platform_admins is 'Administradores da plataforma HospedaMais, separados dos papéis de cada hotel.';
comment on table public.user_activity is 'Último uso operacional por usuário, sem conteúdo digitado, senha ou rastreamento de páginas públicas.';
comment on function public.platform_admin_overview() is 'Resumo de uso e implantação dos hotéis, visível somente ao administrador da plataforma.';
