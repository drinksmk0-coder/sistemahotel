create table if not exists public.corporate_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  document text,
  email text,
  phone text,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint corporate_accounts_name_length check (char_length(trim(name)) between 2 and 120)
);

create unique index if not exists corporate_accounts_company_name_uidx
  on public.corporate_accounts (company_id, lower(trim(name)));

alter table public.clients
  add column if not exists corporate_account_id uuid
  references public.corporate_accounts(id) on delete set null;

create index if not exists clients_company_corporate_account_idx
  on public.clients (company_id, corporate_account_id)
  where corporate_account_id is not null;

alter table public.corporate_accounts enable row level security;

drop policy if exists corporate_accounts_owner_all on public.corporate_accounts;
create policy corporate_accounts_owner_all
on public.corporate_accounts
for all
to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role))
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

grant select, insert, update, delete on table public.corporate_accounts to authenticated;

insert into public.corporate_accounts (company_id, name)
select distinct c.company_id, 'Potencial'
from public.clients c
where lower(trim(c.nome)) like '% - potencial'
on conflict (company_id, lower(trim(name))) do nothing;

update public.clients c
set corporate_account_id = account.id
from public.corporate_accounts account
where account.company_id = c.company_id
  and lower(trim(account.name)) = 'potencial'
  and lower(trim(c.nome)) like '% - potencial'
  and c.corporate_account_id is null;

drop function if exists public.water_consumption_report(uuid, date, date, uuid);

create function public.water_consumption_report(
  p_company_id uuid,
  p_start date,
  p_end date,
  p_corporate_account_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_recipient public.corporate_accounts;
begin
  if auth.uid() is null
     or not public.has_company_role(p_company_id, auth.uid(), 'dono'::public.app_role) then
    raise exception 'Apenas o proprietário pode emitir este relatório.';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Período inválido.';
  end if;

  select account.*
  into v_recipient
  from public.corporate_accounts account
  where account.id = p_corporate_account_id
    and account.company_id = p_company_id
    and account.active = true;

  if v_recipient.id is null then
    raise exception 'Selecione uma empresa cadastrada para emitir o relatório.';
  end if;

  with water_sales as (
    select
      s.id,
      s.data,
      s.quarto,
      s.reserva_id,
      coalesce(s.cliente_id, r.cliente_id) as client_id,
      c.nome as employee_name,
      s.item,
      greatest(0, s.qtd) as quantity,
      greatest(0, s.valor_unit) as unit_value,
      greatest(0, s.total) as total_value,
      greatest(0, s.valor_pago) as paid_value,
      greatest(0, s.total - s.valor_pago) as pending_value,
      s.status,
      s.pagamento,
      s.observacoes
    from public.sales s
    left join public.reservations r
      on r.id = s.reserva_id and r.company_id = s.company_id
    join public.clients c
      on c.id = coalesce(s.cliente_id, r.cliente_id)
     and c.company_id = s.company_id
     and c.corporate_account_id = p_corporate_account_id
    where s.company_id = p_company_id
      and s.data between p_start and p_end
      and (
        lower(coalesce(s.item, '')) like '%água%'
        or lower(coalesce(s.item, '')) like '%agua%'
        or lower(coalesce(s.categoria, '')) like '%água%'
        or lower(coalesce(s.categoria, '')) like '%agua%'
      )
  ),
  note_flags as (
    select
      r.id,
      r.quarto,
      c.nome as employee_name,
      r.checkin,
      r.checkout,
      r.observacoes_importacao
    from public.reservations r
    join public.clients c
      on c.id = r.cliente_id
     and c.company_id = r.company_id
     and c.corporate_account_id = p_corporate_account_id
    where r.company_id = p_company_id
      and r.checkin <= p_end
      and r.checkout >= p_start
      and (
        lower(coalesce(r.observacoes_importacao, '')) like '%água%'
        or lower(coalesce(r.observacoes_importacao, '')) like '%agua%'
      )
      and not exists (
        select 1 from water_sales ws where ws.reserva_id = r.id
      )
  )
  select jsonb_build_object(
    'company', (
      select jsonb_build_object(
        'name', co.nome,
        'document', co.documento,
        'phone', co.telefone,
        'email', co.email,
        'address', co.endereco,
        'city', co.cidade,
        'state', co.estado
      )
      from public.companies co where co.id = p_company_id
    ),
    'recipient_company', jsonb_build_object(
      'id', v_recipient.id,
      'name', v_recipient.name,
      'document', v_recipient.document,
      'email', v_recipient.email,
      'phone', v_recipient.phone
    ),
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'summary', jsonb_build_object(
      'lines', (select count(*) from water_sales),
      'quantity', coalesce((select sum(quantity) from water_sales), 0),
      'total', coalesce((select sum(total_value) from water_sales), 0),
      'paid', coalesce((select sum(paid_value) from water_sales), 0),
      'pending', coalesce((select sum(pending_value) from water_sales), 0),
      'employees', coalesce((select count(distinct employee_name) from water_sales), 0),
      'rooms', coalesce((select count(distinct quarto) from water_sales), 0)
    ),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'date', data,
          'room', quarto,
          'reservation_id', reserva_id,
          'client_id', client_id,
          'employee_name', employee_name,
          'item', item,
          'quantity', quantity,
          'unit_value', unit_value,
          'total', total_value,
          'paid', paid_value,
          'pending', pending_value,
          'status', status,
          'payment', pagamento,
          'notes', observacoes
        ) order by data, quarto, employee_name
      ) from water_sales
    ), '[]'::jsonb),
    'unquantified_notes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'reservation_id', id,
          'room', quarto,
          'employee_name', employee_name,
          'checkin', checkin,
          'checkout', checkout,
          'note', observacoes_importacao
        ) order by checkin, quarto
      ) from note_flags
    ), '[]'::jsonb),
    'generated_at', now(),
    'document_type', 'Espelho empresarial de consumo de água — não é nota fiscal'
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.water_consumption_report(uuid, date, date, uuid) from public;
revoke all on function public.water_consumption_report(uuid, date, date, uuid) from anon;
grant execute on function public.water_consumption_report(uuid, date, date, uuid) to authenticated;
