-- Estrutura de hóspedes por reserva, assinatura digital e sincronização segura do cadastro.

alter table public.reservations
  add column if not exists guest_signature text,
  add column if not exists guest_signature_at timestamptz,
  add column if not exists guest_terms_accepted boolean not null default false,
  add column if not exists guest_terms_accepted_at timestamptz;

alter table public.clients
  add column if not exists updated_from_checkin_at timestamptz;

create table if not exists public.reservation_guests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  nome text not null,
  cpf text,
  telefone text,
  email text,
  data_nascimento date,
  sexo text,
  parentesco text,
  titular boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(nome)) >= 2)
);

create index if not exists reservation_guests_company_idx
  on public.reservation_guests(company_id);
create index if not exists reservation_guests_reservation_idx
  on public.reservation_guests(reservation_id);
create unique index if not exists reservation_guests_one_holder_idx
  on public.reservation_guests(reservation_id)
  where titular = true;

alter table public.reservation_guests enable row level security;

drop policy if exists reservation_guests_select_members on public.reservation_guests;
drop policy if exists reservation_guests_insert_staff on public.reservation_guests;
drop policy if exists reservation_guests_update_staff on public.reservation_guests;
drop policy if exists reservation_guests_delete_staff on public.reservation_guests;

create policy reservation_guests_select_members
on public.reservation_guests
for select to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

create policy reservation_guests_insert_staff
on public.reservation_guests
for insert to authenticated
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao')
);

create policy reservation_guests_update_staff
on public.reservation_guests
for update to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao')
)
with check (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao')
);

create policy reservation_guests_delete_staff
on public.reservation_guests
for delete to authenticated
using (
  public.has_company_role(company_id, (select auth.uid()), 'dono')
  or public.has_company_role(company_id, (select auth.uid()), 'recepcao')
);

create or replace function public.set_reservation_guest_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_reservation_guest_updated_at() from public, anon, authenticated;

drop trigger if exists trg_reservation_guests_updated_at on public.reservation_guests;
create trigger trg_reservation_guests_updated_at
before update on public.reservation_guests
for each row execute function public.set_reservation_guest_updated_at();

create or replace function public.save_reservation_guest_details(
  p_reservation_id uuid,
  p_holder jsonb,
  p_companions jsonb default '[]'::jsonb,
  p_signature text default null,
  p_terms_accepted boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reservation public.reservations%rowtype;
  v_holder_client_id uuid;
  v_guest jsonb;
  v_count integer := 0;
  v_name text;
  v_cpf text;
  v_phone text;
  v_email text;
begin
  select * into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Reserva não encontrada.';
  end if;

  if not (
    public.has_company_role(v_reservation.company_id, auth.uid(), 'dono')
    or public.has_company_role(v_reservation.company_id, auth.uid(), 'recepcao')
  ) then
    raise exception using errcode = '42501', message = 'Sem permissão para alterar os hóspedes desta reserva.';
  end if;

  v_name := nullif(trim(p_holder ->> 'nome'), '');
  v_cpf := nullif(trim(p_holder ->> 'cpf'), '');
  v_phone := nullif(trim(p_holder ->> 'telefone'), '');
  v_email := nullif(trim(p_holder ->> 'email'), '');

  if v_name is null then
    raise exception using errcode = '22023', message = 'Informe o nome do hóspede titular.';
  end if;

  v_holder_client_id := v_reservation.cliente_id;

  if v_holder_client_id is not null then
    update public.clients
       set nome = coalesce(v_name, nome),
           cpf = coalesce(v_cpf, cpf),
           telefone = coalesce(v_phone, telefone),
           email = coalesce(v_email, email),
           data_nascimento = coalesce(nullif(p_holder ->> 'data_nascimento', '')::date, data_nascimento),
           sexo = coalesce(nullif(trim(p_holder ->> 'sexo'), ''), sexo),
           profissao = coalesce(nullif(trim(p_holder ->> 'profissao'), ''), profissao),
           cidade = coalesce(nullif(trim(p_holder ->> 'cidade'), ''), cidade),
           estado = coalesce(nullif(trim(p_holder ->> 'estado'), ''), estado),
           cep = coalesce(nullif(trim(p_holder ->> 'cep'), ''), cep),
           bairro = coalesce(nullif(trim(p_holder ->> 'bairro'), ''), bairro),
           estado_civil = coalesce(nullif(trim(p_holder ->> 'estado_civil'), ''), estado_civil),
           updated_from_checkin_at = now()
     where id = v_holder_client_id
       and company_id = v_reservation.company_id;
  end if;

  delete from public.reservation_guests
  where reservation_id = p_reservation_id;

  insert into public.reservation_guests (
    company_id, reservation_id, client_id, nome, cpf, telefone, email,
    data_nascimento, sexo, parentesco, titular
  ) values (
    v_reservation.company_id,
    p_reservation_id,
    v_holder_client_id,
    v_name,
    v_cpf,
    v_phone,
    v_email,
    nullif(p_holder ->> 'data_nascimento', '')::date,
    nullif(trim(p_holder ->> 'sexo'), ''),
    'titular',
    true
  );
  v_count := 1;

  if jsonb_typeof(coalesce(p_companions, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Acompanhantes devem ser enviados em uma lista.';
  end if;

  for v_guest in select value from jsonb_array_elements(coalesce(p_companions, '[]'::jsonb))
  loop
    v_name := nullif(trim(v_guest ->> 'nome'), '');
    if v_name is null then
      continue;
    end if;

    insert into public.reservation_guests (
      company_id, reservation_id, nome, cpf, telefone, email,
      data_nascimento, sexo, parentesco, titular
    ) values (
      v_reservation.company_id,
      p_reservation_id,
      v_name,
      nullif(trim(v_guest ->> 'cpf'), ''),
      nullif(trim(v_guest ->> 'telefone'), ''),
      nullif(trim(v_guest ->> 'email'), ''),
      nullif(v_guest ->> 'data_nascimento', '')::date,
      nullif(trim(v_guest ->> 'sexo'), ''),
      coalesce(nullif(trim(v_guest ->> 'parentesco'), ''), 'acompanhante'),
      false
    );
    v_count := v_count + 1;
  end loop;

  update public.reservations
     set pessoas = greatest(1, v_count),
         cliente_nome = v_name,
         guest_signature = case
           when nullif(trim(coalesce(p_signature, '')), '') is not null then p_signature
           else guest_signature
         end,
         guest_signature_at = case
           when nullif(trim(coalesce(p_signature, '')), '') is not null then now()
           else guest_signature_at
         end,
         guest_terms_accepted = p_terms_accepted,
         guest_terms_accepted_at = case when p_terms_accepted then now() else null end
   where id = p_reservation_id;

  return jsonb_build_object(
    'reservation_id', p_reservation_id,
    'guest_count', v_count,
    'signature_saved', nullif(trim(coalesce(p_signature, '')), '') is not null,
    'profile_updated', v_holder_client_id is not null
  );
end;
$$;

revoke all on function public.save_reservation_guest_details(uuid, jsonb, jsonb, text, boolean)
from public, anon;
grant execute on function public.save_reservation_guest_details(uuid, jsonb, jsonb, text, boolean)
to authenticated;
