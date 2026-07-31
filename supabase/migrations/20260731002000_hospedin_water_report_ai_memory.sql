alter table public.reservations
  add column if not exists origem_importacao text,
  add column if not exists observacoes_importacao text;

create unique index if not exists reservations_company_external_code_uidx
  on public.reservations (company_id, lower(trim(codigo_externo)))
  where codigo_externo is not null and trim(codigo_externo) <> '';

create or replace function public.prevent_duplicate_individual_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_duplicate public.reservations;
begin
  if new.group_id is not null
     or new.status in ('cancelado', 'manutencao') then
    return new;
  end if;

  select r.*
    into v_duplicate
    from public.reservations r
   where r.company_id = new.company_id
     and r.id <> coalesce(new.id, gen_random_uuid())
     and r.group_id is null
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

drop trigger if exists reservations_prevent_individual_duplicate on public.reservations;
create trigger reservations_prevent_individual_duplicate
before insert or update of cliente_id, cliente_nome, checkin, checkout, status, group_id
on public.reservations
for each row
execute function public.prevent_duplicate_individual_reservation();

create table if not exists public.company_ai_memory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null default 'operacao',
  title text not null,
  content text not null,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_ai_memory_title_length check (char_length(trim(title)) between 3 and 120),
  constraint company_ai_memory_content_length check (char_length(trim(content)) between 3 and 12000),
  constraint company_ai_memory_category_check check (
    category in ('operacao', 'tarifas', 'atendimento', 'financeiro', 'marketing', 'outros')
  )
);

alter table public.company_ai_memory enable row level security;

drop policy if exists company_ai_memory_owner_select on public.company_ai_memory;
create policy company_ai_memory_owner_select
on public.company_ai_memory for select
to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

drop policy if exists company_ai_memory_owner_insert on public.company_ai_memory;
create policy company_ai_memory_owner_insert
on public.company_ai_memory for insert
to authenticated
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

drop policy if exists company_ai_memory_owner_update on public.company_ai_memory;
create policy company_ai_memory_owner_update
on public.company_ai_memory for update
to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role))
with check (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

drop policy if exists company_ai_memory_owner_delete on public.company_ai_memory;
create policy company_ai_memory_owner_delete
on public.company_ai_memory for delete
to authenticated
using (public.has_company_role(company_id, (select auth.uid()), 'dono'::public.app_role));

create index if not exists company_ai_memory_company_active_idx
  on public.company_ai_memory (company_id, active, updated_at desc);

create or replace function public.water_consumption_report(
  p_company_id uuid,
  p_start date,
  p_end date,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or not public.has_company_role(p_company_id, auth.uid(), 'dono'::public.app_role) then
    raise exception 'Apenas o proprietário pode emitir este relatório.';
  end if;

  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Período inválido.';
  end if;

  with water_sales as (
    select
      s.id,
      s.data,
      s.quarto,
      s.reserva_id,
      s.cliente_id,
      coalesce(c.nome, r.cliente_nome, 'Hóspede não identificado') as guest_name,
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
    left join public.clients c
      on c.id = coalesce(s.cliente_id, r.cliente_id) and c.company_id = s.company_id
    where s.company_id = p_company_id
      and s.data between p_start and p_end
      and (p_client_id is null or coalesce(s.cliente_id, r.cliente_id) = p_client_id)
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
      r.cliente_nome,
      r.checkin,
      r.checkout,
      r.observacoes_importacao
    from public.reservations r
    where r.company_id = p_company_id
      and r.checkin <= p_end
      and r.checkout >= p_start
      and p_client_id is null
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
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'summary', jsonb_build_object(
      'lines', (select count(*) from water_sales),
      'quantity', coalesce((select sum(quantity) from water_sales), 0),
      'total', coalesce((select sum(total_value) from water_sales), 0),
      'paid', coalesce((select sum(paid_value) from water_sales), 0),
      'pending', coalesce((select sum(pending_value) from water_sales), 0),
      'guests', coalesce((select count(distinct guest_name) from water_sales), 0),
      'rooms', coalesce((select count(distinct quarto) from water_sales), 0)
    ),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'date', data,
          'room', quarto,
          'reservation_id', reserva_id,
          'client_id', cliente_id,
          'guest_name', guest_name,
          'item', item,
          'quantity', quantity,
          'unit_value', unit_value,
          'total', total_value,
          'paid', paid_value,
          'pending', pending_value,
          'status', status,
          'payment', pagamento,
          'notes', observacoes
        ) order by data, quarto, guest_name
      ) from water_sales
    ), '[]'::jsonb),
    'unquantified_notes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'reservation_id', id,
          'room', quarto,
          'guest_name', cliente_nome,
          'checkin', checkin,
          'checkout', checkout,
          'note', observacoes_importacao
        ) order by checkin, quarto
      ) from note_flags
    ), '[]'::jsonb),
    'generated_at', now(),
    'document_type', 'Espelho de consumo de água — não é nota fiscal'
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.water_consumption_report(uuid, date, date, uuid) to authenticated;
