create table if not exists public.guest_checkins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  public_token uuid not null default gen_random_uuid(),
  status text not null default 'enviado'
    check (status in ('enviado', 'preenchido', 'conferido', 'enviado_mtur', 'erro_mtur')),
  form_data jsonb not null default '{}'::jsonb,
  signature_data_url text,
  guest_consent boolean not null default false,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  mtur_protocol text,
  mtur_status text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_checkins_reservation_unique unique (reservation_id),
  constraint guest_checkins_public_token_unique unique (public_token),
  constraint guest_checkins_signature_size
    check (signature_data_url is null or char_length(signature_data_url) <= 500000)
);

create index if not exists guest_checkins_company_status_idx
  on public.guest_checkins(company_id, status, created_at desc);

alter table public.guest_checkins enable row level security;

drop policy if exists guest_checkins_company_select on public.guest_checkins;
create policy guest_checkins_company_select
on public.guest_checkins
for select
to authenticated
using (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists guest_checkins_company_insert on public.guest_checkins;
create policy guest_checkins_company_insert
on public.guest_checkins
for insert
to authenticated
with check (public.is_company_member(company_id, (select auth.uid())));

drop policy if exists guest_checkins_company_update on public.guest_checkins;
create policy guest_checkins_company_update
on public.guest_checkins
for update
to authenticated
using (public.is_company_member(company_id, (select auth.uid())))
with check (public.is_company_member(company_id, (select auth.uid())));

revoke all on public.guest_checkins from anon;
grant select, insert, update on public.guest_checkins to authenticated;
grant all on public.guest_checkins to service_role;

create or replace function public.get_guest_checkin(p_token uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', gc.id,
    'status', gc.status,
    'submitted_at', gc.submitted_at,
    'form_data', gc.form_data,
    'signature_data_url', gc.signature_data_url,
    'company_name', co.nome,
    'reservation_code', coalesce(r.codigo_externo, left(r.id::text, 8)),
    'room', r.quarto,
    'checkin', r.checkin,
    'checkout', r.checkout,
    'adults', r.pessoas,
    'children', 0,
    'guest', jsonb_build_object(
      'name', cl.nome,
      'email', cl.email,
      'phone', cl.telefone,
      'document', coalesce(cl.cpf, cl.documento),
      'birth_date', cl.data_nascimento,
      'profession', cl.profissao,
      'gender', cl.sexo,
      'civil_status', cl.estado_civil,
      'city', cl.cidade,
      'state', cl.estado,
      'country', cl.pais,
      'postal_code', cl.cep,
      'district', cl.bairro
    )
  )
  from public.guest_checkins gc
  join public.companies co on co.id = gc.company_id
  join public.reservations r on r.id = gc.reservation_id
  left join public.clients cl on cl.id = gc.client_id
  where gc.public_token = p_token
    and gc.status <> 'erro_mtur'
  limit 1
$$;

revoke all on function public.get_guest_checkin(uuid) from public;
grant execute on function public.get_guest_checkin(uuid) to anon, authenticated, service_role;

create or replace function public.submit_guest_checkin(
  p_token uuid,
  p_form_data jsonb,
  p_signature_data_url text,
  p_guest_consent boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_row public.guest_checkins;
begin
  if p_form_data is null or jsonb_typeof(p_form_data) <> 'object' then
    raise exception 'Dados do formulário inválidos';
  end if;

  if coalesce(length(trim(p_form_data->>'nome_completo')), 0) < 3 then
    raise exception 'Informe o nome completo';
  end if;

  if p_guest_consent is not true then
    raise exception 'É necessário aceitar o tratamento dos dados para o check-in';
  end if;

  if p_signature_data_url is null
    or p_signature_data_url not like 'data:image/png;base64,%'
    or char_length(p_signature_data_url) > 500000 then
    raise exception 'Assinatura digital inválida';
  end if;

  update public.guest_checkins
     set form_data = p_form_data,
         signature_data_url = p_signature_data_url,
         guest_consent = true,
         status = 'preenchido',
         submitted_at = now(),
         updated_at = now()
   where public_token = p_token
     and status in ('enviado', 'preenchido')
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'Link inválido ou formulário já encerrado';
  end if;

  return jsonb_build_object(
    'id', updated_row.id,
    'status', updated_row.status,
    'submitted_at', updated_row.submitted_at
  );
end;
$$;

revoke all on function public.submit_guest_checkin(uuid, jsonb, text, boolean) from public;
grant execute on function public.submit_guest_checkin(uuid, jsonb, text, boolean)
  to anon, authenticated, service_role;
