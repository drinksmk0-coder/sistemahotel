-- SaaS / multi-company foundation.
-- Every operational row belongs to a company. RLS checks membership before reading/writing.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  documento text,
  telefone text,
  whatsapp text,
  email text,
  endereco text,
  cidade text,
  estado text,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'recepcao',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  nome text,
  role public.app_role not null default 'recepcao',
  status text not null default 'pendente',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create table if not exists public.company_integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null,
  nome text not null,
  identificador text,
  webhook_url text,
  ativo boolean not null default true,
  configuracao jsonb not null default '{}'::jsonb,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  data date not null default current_date,
  categoria text not null default 'Geral',
  descricao text not null,
  valor numeric not null default 0,
  pagamento text,
  fornecedor text,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.company_invites enable row level security;
alter table public.company_integrations enable row level security;
alter table public.expenses enable row level security;

create or replace function public.is_company_member(_company_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = _company_id
      and cm.user_id = _user_id
      and cm.ativo
  );
$$;

create or replace function public.has_company_role(_company_id uuid, _user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = _company_id
      and cm.user_id = _user_id
      and cm.role = _role
      and cm.ativo
  );
$$;

revoke execute on function public.is_company_member(uuid, uuid) from public;
revoke execute on function public.has_company_role(uuid, uuid, public.app_role) from public;
grant execute on function public.is_company_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_company_role(uuid, uuid, public.app_role) to authenticated, service_role;

-- Default company for current Hotel Real data.
insert into public.companies (nome, slug, cidade, estado, created_by)
select 'Hotel Real Cruzilia', 'hotel-real-cruzilia', 'Cruzilia', 'MG', p.id
from public.profiles p
where p.email = 'drinksmk0@gmail.com'
on conflict (slug) do nothing;

insert into public.company_members (company_id, user_id, role)
select c.id, ur.user_id, ur.role
from public.companies c
join public.user_roles ur on true
where c.slug = 'hotel-real-cruzilia'
on conflict (company_id, user_id) do update set role = excluded.role, ativo = true;

-- Tenant columns.
alter table public.rooms add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.clients add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.reservations add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.sales add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.complaints add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.feedbacks add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.products add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.integration_events add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.whatsapp_reservation_sessions add column if not exists company_id uuid references public.companies(id) on delete cascade;

do $$
declare
  default_company uuid;
begin
  select id into default_company from public.companies where slug = 'hotel-real-cruzilia';
  if default_company is not null then
    update public.rooms set company_id = default_company where company_id is null;
    update public.clients set company_id = default_company where company_id is null;
    update public.reservations set company_id = default_company where company_id is null;
    update public.sales set company_id = default_company where company_id is null;
    update public.complaints set company_id = default_company where company_id is null;
    update public.feedbacks set company_id = default_company where company_id is null;
    update public.products set company_id = default_company where company_id is null;
    update public.integration_events set company_id = default_company where company_id is null;
    update public.whatsapp_reservation_sessions set company_id = default_company where company_id is null;
  end if;
end $$;

alter table public.rooms alter column company_id set not null;
alter table public.clients alter column company_id set not null;
alter table public.reservations alter column company_id set not null;
alter table public.sales alter column company_id set not null;
alter table public.complaints alter column company_id set not null;
alter table public.products alter column company_id set not null;

alter table public.reservations drop constraint if exists reservations_quarto_fkey;
alter table public.sales drop constraint if exists sales_quarto_fkey;
alter table public.complaints drop constraint if exists complaints_quarto_fkey;
alter table public.rooms add column if not exists id uuid default gen_random_uuid();
update public.rooms set id = gen_random_uuid() where id is null;
alter table public.rooms alter column id set not null;
alter table public.rooms drop constraint if exists rooms_pkey;
alter table public.rooms add constraint rooms_pkey primary key (id);
create unique index if not exists rooms_company_numero_unique on public.rooms (company_id, numero);
alter table public.reservations
  add constraint reservations_company_room_fkey
  foreign key (company_id, quarto) references public.rooms(company_id, numero)
  on update cascade;
alter table public.sales
  add constraint sales_company_room_fkey
  foreign key (company_id, quarto) references public.rooms(company_id, numero)
  on update cascade;
alter table public.complaints
  add constraint complaints_company_room_fkey
  foreign key (company_id, quarto) references public.rooms(company_id, numero)
  on update cascade;
drop index if exists clients_cpf_digits_unique;
create unique index if not exists clients_company_cpf_digits_unique
on public.clients (company_id, (regexp_replace(cpf, '\D', '', 'g')))
where cpf is not null and regexp_replace(cpf, '\D', '', 'g') <> '';

create index if not exists reservations_company_dates_idx on public.reservations (company_id, quarto, checkin, checkout);
create index if not exists sales_company_data_idx on public.sales (company_id, data);
create index if not exists expenses_company_data_idx on public.expenses (company_id, data);

alter table public.whatsapp_reservation_sessions drop constraint if exists whatsapp_reservation_sessions_phone_key;
create unique index if not exists whatsapp_sessions_company_phone_unique
on public.whatsapp_reservation_sessions (company_id, phone);

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at before update on public.companies
for each row execute function public.update_updated_at_column();

drop trigger if exists company_integrations_updated_at on public.company_integrations;
create trigger company_integrations_updated_at before update on public.company_integrations
for each row execute function public.update_updated_at_column();

-- Policies for company tables.
drop policy if exists companies_member_select on public.companies;
create policy companies_member_select on public.companies
for select to authenticated
using (public.is_company_member(id, (select auth.uid())));

drop policy if exists companies_owner_insert on public.companies;
create policy companies_owner_insert on public.companies
for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists companies_owner_update on public.companies;
create policy companies_owner_update on public.companies
for update to authenticated
using (public.has_company_role(id, (select auth.uid()), 'dono'))
with check (public.has_company_role(id, (select auth.uid()), 'dono'));

drop policy if exists company_members_member_select on public.company_members;
create policy company_members_member_select on public.company_members
for select to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists company_members_owner_write on public.company_members;
create policy company_members_owner_write on public.company_members
for all to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'))
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'));

drop policy if exists company_invites_owner_all on public.company_invites;
create policy company_invites_owner_all on public.company_invites
for all to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'))
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'));

drop policy if exists company_integrations_staff_all on public.company_integrations;
create policy company_integrations_staff_all on public.company_integrations
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists expenses_staff_all on public.expenses;
create policy expenses_staff_all on public.expenses
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

-- Replace broad staff policies with tenant-aware policies.
drop policy if exists rooms_select_all on public.rooms;
drop policy if exists rooms_write_dono on public.rooms;
create policy rooms_company_select on public.rooms
for select to authenticated, anon
using (company_id is null or public.is_company_member(company_id, (select auth.uid())));
create policy rooms_company_write on public.rooms
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists clients_all_authenticated on public.clients;
drop policy if exists clients_all_staff on public.clients;
create policy clients_company_all on public.clients
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists reservations_all_authenticated on public.reservations;
drop policy if exists reservations_all_staff on public.reservations;
create policy reservations_company_all on public.reservations
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists sales_all_authenticated on public.sales;
drop policy if exists sales_all_staff on public.sales;
create policy sales_company_all on public.sales
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists complaints_all_authenticated on public.complaints;
drop policy if exists complaints_all_staff on public.complaints;
drop policy if exists complaints_insert_public on public.complaints;
create policy complaints_company_staff_all on public.complaints
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));
create policy complaints_public_insert on public.complaints
for insert to anon
with check (true);

drop policy if exists feedbacks_select_staff on public.feedbacks;
drop policy if exists feedbacks_insert_public on public.feedbacks;
drop policy if exists feedbacks_all_staff on public.feedbacks;
create policy feedbacks_company_staff_select on public.feedbacks
for select to authenticated
using (company_id is null or public.is_company_member(company_id, (select auth.uid())));
create policy feedbacks_public_insert on public.feedbacks
for insert to anon
with check (true);

drop policy if exists products_all_staff on public.products;
create policy products_company_all on public.products
for all to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists integration_events_staff_select on public.integration_events;
create policy integration_events_company_select on public.integration_events
for select to authenticated
using (company_id is null or public.is_company_member(company_id, (select auth.uid())));

drop policy if exists whatsapp_reservation_sessions_staff_select on public.whatsapp_reservation_sessions;
create policy whatsapp_sessions_company_select on public.whatsapp_reservation_sessions
for select to authenticated
using (company_id is null or public.is_company_member(company_id, (select auth.uid())));

grant select, insert, update on public.companies to authenticated;
grant select, insert, update, delete on public.company_members to authenticated;
grant select, insert, update, delete on public.company_invites to authenticated;
grant select, insert, update, delete on public.company_integrations to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.companies, public.company_members, public.company_invites, public.company_integrations, public.expenses to service_role;

create or replace function public.reservation_has_overlap(
  _company_id uuid,
  _quarto integer,
  _checkin date,
  _checkout date,
  _exclude_id uuid default null
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.reservations r
    where r.company_id = _company_id
      and r.quarto = _quarto
      and (_exclude_id is null or r.id <> _exclude_id)
      and r.status not in ('cancelado', 'finalizado', 'manutencao')
      and _checkin < r.checkout::date
      and _checkout > r.checkin::date
  );
$$;

grant execute on function public.reservation_has_overlap(uuid, integer, date, date, uuid) to authenticated, service_role;
