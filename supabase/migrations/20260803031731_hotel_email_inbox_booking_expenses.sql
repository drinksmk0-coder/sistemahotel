alter table public.booking_email_events
  drop constraint if exists booking_email_events_event_type_check;

alter table public.booking_email_events
  add constraint booking_email_events_event_type_check
  check (event_type in ('cancellation', 'new_reservation'));

alter table public.booking_email_events
  add column if not exists checkin date,
  add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists booking_email_events_reservation_idx
  on public.booking_email_events (reservation_id)
  where reservation_id is not null;

create policy booking_email_events_reception_select
  on public.booking_email_events
  for select
  to authenticated
  using (
    public.has_company_role(company_id, auth.uid(), 'dono'::public.app_role)
    or public.has_company_role(company_id, auth.uid(), 'recepcao'::public.app_role)
  );

create or replace function public.record_booking_email_new_reservation(
  p_company_id uuid,
  p_gmail_message_id text,
  p_original_sender text,
  p_subject text,
  p_received_at timestamptz,
  p_booking_code text,
  p_hotel_id text,
  p_checkin date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.booking_email_events;
  v_reservation public.reservations;
begin
  if nullif(trim(p_gmail_message_id), '') is null then
    raise exception 'gmail_message_id obrigatório';
  end if;

  select * into v_event
  from public.booking_email_events
  where company_id = p_company_id
    and gmail_message_id = p_gmail_message_id;

  if found then
    return jsonb_build_object(
      'ok', true,
      'duplicated', true,
      'event_id', v_event.id,
      'status', v_event.status,
      'booking_code', v_event.booking_code
    );
  end if;

  if coalesce(p_original_sender, '') !~* 'noreply@booking\.com' then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, event_type,
      sender, subject, received_at, checkin, status, error, processed_at
    ) values (
      p_company_id, p_gmail_message_id,
      coalesce(nullif(trim(p_booking_code), ''), 'nao-identificado'),
      p_hotel_id, 'new_reservation', p_original_sender, p_subject,
      p_received_at, p_checkin, 'ignored',
      'Remetente original não comprovado como Booking.com', now()
    ) returning * into v_event;
    return jsonb_build_object('ok', true, 'ignored', true, 'event_id', v_event.id);
  end if;

  if p_hotel_id is distinct from '12775712' then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, event_type,
      sender, subject, received_at, checkin, status, error
    ) values (
      p_company_id, p_gmail_message_id,
      coalesce(nullif(trim(p_booking_code), ''), 'nao-identificado'),
      p_hotel_id, 'new_reservation', p_original_sender, p_subject,
      p_received_at, p_checkin, 'needs_review',
      'hotel_id ausente ou diferente do Hotel Real Cruzília'
    ) returning * into v_event;
    return jsonb_build_object('ok', true, 'needs_review', true, 'event_id', v_event.id);
  end if;

  if coalesce(p_booking_code, '') !~ '^[0-9]{8,12}$' or p_checkin is null then
    insert into public.booking_email_events (
      company_id, gmail_message_id, booking_code, hotel_id, event_type,
      sender, subject, received_at, checkin, status, error
    ) values (
      p_company_id, p_gmail_message_id,
      coalesce(nullif(trim(p_booking_code), ''), 'nao-identificado'),
      p_hotel_id, 'new_reservation', p_original_sender, p_subject,
      p_received_at, p_checkin, 'needs_review',
      'Código da Booking ou data de entrada não identificados'
    ) returning * into v_event;
    return jsonb_build_object('ok', true, 'needs_review', true, 'event_id', v_event.id);
  end if;

  select * into v_reservation
  from public.reservations
  where company_id = p_company_id
    and codigo_externo = p_booking_code
  limit 1;

  insert into public.booking_email_events (
    company_id, gmail_message_id, booking_code, hotel_id, event_type,
    sender, subject, received_at, checkin, status, reservation_id,
    error, processed_at, details
  ) values (
    p_company_id, p_gmail_message_id, p_booking_code, p_hotel_id,
    'new_reservation', p_original_sender, p_subject, p_received_at, p_checkin,
    case when v_reservation.id is null then 'needs_review' else 'processed' end,
    v_reservation.id,
    case when v_reservation.id is null
      then 'Complete hóspede, quarto, saída, pessoas e valor antes de criar a reserva'
      else null
    end,
    case when v_reservation.id is null then null else now() end,
    jsonb_build_object('source', 'gmail_booking')
  ) returning * into v_event;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event.id,
    'status', v_event.status,
    'reservation_id', v_event.reservation_id,
    'booking_code', v_event.booking_code
  );
end;
$$;

revoke all on function public.record_booking_email_new_reservation(uuid, text, text, text, timestamptz, text, text, date)
  from public, anon, authenticated;
grant execute on function public.record_booking_email_new_reservation(uuid, text, text, text, timestamptz, text, text, date)
  to service_role;

create table if not exists public.expense_email_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gmail_message_id text not null,
  original_sender text,
  subject text,
  received_at timestamptz,
  vendor text,
  document_type text,
  document_number text,
  due_date date,
  amount numeric(12,2),
  category text,
  description text,
  payment_method text,
  confidence numeric(5,4),
  business_evidence boolean not null default false,
  personal_suspected boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'needs_review', 'ignored', 'error')),
  expense_id uuid references public.expenses(id) on delete set null,
  error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, gmail_message_id)
);

create index if not exists expense_email_events_company_status_idx
  on public.expense_email_events (company_id, status, created_at desc);
create index if not exists expense_email_events_expense_idx
  on public.expense_email_events (expense_id)
  where expense_id is not null;

alter table public.expense_email_events enable row level security;

create policy expense_email_events_staff_select
  on public.expense_email_events
  for select
  to authenticated
  using (
    public.has_company_role(company_id, auth.uid(), 'dono'::public.app_role)
    or public.has_company_role(company_id, auth.uid(), 'recepcao'::public.app_role)
  );

create or replace function public.record_expense_email_event(
  p_company_id uuid,
  p_gmail_message_id text,
  p_original_sender text,
  p_subject text,
  p_received_at timestamptz,
  p_vendor text,
  p_document_type text,
  p_document_number text,
  p_due_date date,
  p_amount numeric,
  p_category text,
  p_description text,
  p_payment_method text,
  p_confidence numeric,
  p_business_evidence boolean,
  p_personal_suspected boolean,
  p_auto_approved boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.expense_email_events;
  v_expense_id uuid;
  v_trusted boolean;
  v_category text;
  v_description text;
begin
  if nullif(trim(p_gmail_message_id), '') is null then
    raise exception 'gmail_message_id obrigatório';
  end if;

  select * into v_event
  from public.expense_email_events
  where company_id = p_company_id
    and gmail_message_id = p_gmail_message_id;

  if found then
    return jsonb_build_object(
      'ok', true, 'duplicated', true, 'event_id', v_event.id,
      'status', v_event.status, 'expense_id', v_event.expense_id
    );
  end if;

  v_trusted := coalesce(p_vendor, '') ~* 'booking|cemig|companhia energ[eé]tica';
  v_category := coalesce(
    nullif(trim(p_category), ''),
    case
      when coalesce(p_vendor, '') ~* 'booking' then 'Comissões e taxas'
      when coalesce(p_vendor, '') ~* 'cemig|companhia energ[eé]tica' then 'Energia elétrica'
      else 'Outros'
    end
  );
  v_description := coalesce(
    nullif(trim(p_description), ''),
    nullif(trim(p_subject), ''),
    'Conta recebida por e-mail'
  );

  if p_personal_suspected then
    insert into public.expense_email_events (
      company_id, gmail_message_id, original_sender, subject, received_at,
      vendor, document_type, document_number, due_date, amount, category,
      description, payment_method, confidence, business_evidence,
      personal_suspected, status, error, processed_at
    ) values (
      p_company_id, p_gmail_message_id, p_original_sender, p_subject, p_received_at,
      p_vendor, p_document_type, p_document_number, p_due_date, p_amount,
      v_category, v_description, p_payment_method, p_confidence,
      p_business_evidence, true, 'ignored',
      'Mensagem possivelmente pessoal; não foi lançada como despesa do hotel', now()
    ) returning * into v_event;
    return jsonb_build_object('ok', true, 'ignored', true, 'event_id', v_event.id);
  end if;

  if coalesce(p_amount, 0) <= 0
     or nullif(trim(coalesce(p_vendor, '')), '') is null then
    insert into public.expense_email_events (
      company_id, gmail_message_id, original_sender, subject, received_at,
      vendor, document_type, document_number, due_date, amount, category,
      description, payment_method, confidence, business_evidence,
      personal_suspected, status, error
    ) values (
      p_company_id, p_gmail_message_id, p_original_sender, p_subject, p_received_at,
      p_vendor, p_document_type, p_document_number, p_due_date, p_amount,
      v_category, v_description, p_payment_method, p_confidence,
      p_business_evidence, false, 'needs_review',
      'Fornecedor ou valor não identificado com segurança'
    ) returning * into v_event;
    return jsonb_build_object('ok', true, 'needs_review', true, 'event_id', v_event.id);
  end if;

  if p_auto_approved and p_business_evidence and v_trusted
     and coalesce(p_confidence, 0) >= 0.90 then
    insert into public.expenses (
      company_id, data, categoria, descricao, valor, pagamento,
      fornecedor, observacoes
    ) values (
      p_company_id,
      coalesce(p_due_date, (p_received_at at time zone 'America/Sao_Paulo')::date, current_date),
      v_category,
      v_description,
      p_amount,
      coalesce(nullif(trim(p_payment_method), ''), 'Pendente'),
      p_vendor,
      concat_ws(' | ',
        'Importado automaticamente do Gmail',
        'Mensagem ' || p_gmail_message_id,
        case when p_document_number is not null then 'Documento ' || p_document_number end,
        case when p_due_date is not null then 'Vencimento ' || p_due_date::text end
      )
    ) returning id into v_expense_id;

    insert into public.expense_email_events (
      company_id, gmail_message_id, original_sender, subject, received_at,
      vendor, document_type, document_number, due_date, amount, category,
      description, payment_method, confidence, business_evidence,
      personal_suspected, status, expense_id, processed_at
    ) values (
      p_company_id, p_gmail_message_id, p_original_sender, p_subject, p_received_at,
      p_vendor, p_document_type, p_document_number, p_due_date, p_amount,
      v_category, v_description, p_payment_method, p_confidence,
      true, false, 'processed', v_expense_id, now()
    ) returning * into v_event;

    return jsonb_build_object(
      'ok', true, 'processed', true, 'event_id', v_event.id,
      'expense_id', v_expense_id
    );
  end if;

  insert into public.expense_email_events (
    company_id, gmail_message_id, original_sender, subject, received_at,
    vendor, document_type, document_number, due_date, amount, category,
    description, payment_method, confidence, business_evidence,
    personal_suspected, status, error
  ) values (
    p_company_id, p_gmail_message_id, p_original_sender, p_subject, p_received_at,
    p_vendor, p_document_type, p_document_number, p_due_date, p_amount,
    v_category, v_description, p_payment_method, p_confidence,
    p_business_evidence, false, 'needs_review',
    case
      when coalesce(p_vendor, '') ~* 'mercado ?livre'
        then 'Compra do Mercado Livre exige confirmação para separar itens pessoais do hotel'
      when not p_business_evidence
        then 'Não foi encontrada evidência suficiente de que a conta pertence ao hotel'
      else 'Conferência humana necessária antes do lançamento'
    end
  ) returning * into v_event;

  return jsonb_build_object('ok', true, 'needs_review', true, 'event_id', v_event.id);
end;
$$;

revoke all on function public.record_expense_email_event(uuid, text, text, text, timestamptz, text, text, text, date, numeric, text, text, text, numeric, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.record_expense_email_event(uuid, text, text, text, timestamptz, text, text, text, date, numeric, text, text, text, numeric, boolean, boolean, boolean)
  to service_role;

create or replace function public.approve_expense_email_event(
  p_event_id uuid,
  p_date date,
  p_category text,
  p_description text,
  p_amount numeric,
  p_payment_method text,
  p_vendor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.expense_email_events;
  v_expense_id uuid;
begin
  select * into v_event
  from public.expense_email_events
  where id = p_event_id
  for update;

  if v_event.id is null then raise exception 'Evento não encontrado'; end if;
  if not public.has_company_role(v_event.company_id, auth.uid(), 'dono'::public.app_role) then
    raise exception 'Somente o proprietário pode aprovar despesas recebidas por e-mail';
  end if;
  if v_event.status = 'processed' and v_event.expense_id is not null then
    return v_event.expense_id;
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Informe um valor válido'; end if;

  insert into public.expenses (
    company_id, data, categoria, descricao, valor, pagamento,
    fornecedor, observacoes, created_by
  ) values (
    v_event.company_id,
    coalesce(p_date, v_event.due_date, current_date),
    coalesce(nullif(trim(p_category), ''), 'Outros'),
    coalesce(
      nullif(trim(p_description), ''),
      v_event.description,
      v_event.subject,
      'Despesa recebida por e-mail'
    ),
    p_amount,
    coalesce(nullif(trim(p_payment_method), ''), 'Pendente'),
    coalesce(nullif(trim(p_vendor), ''), v_event.vendor),
    concat_ws(' | ', 'Aprovado na Central de entradas', 'Mensagem ' || v_event.gmail_message_id),
    auth.uid()
  ) returning id into v_expense_id;

  update public.expense_email_events
  set status = 'processed',
      expense_id = v_expense_id,
      error = null,
      processed_at = now(),
      due_date = coalesce(p_date, due_date),
      category = p_category,
      description = p_description,
      amount = p_amount,
      payment_method = p_payment_method,
      vendor = p_vendor
  where id = v_event.id;

  return v_expense_id;
end;
$$;

revoke all on function public.approve_expense_email_event(uuid, date, text, text, numeric, text, text)
  from public, anon;
grant execute on function public.approve_expense_email_event(uuid, date, text, text, numeric, text, text)
  to authenticated;

create or replace function public.ignore_expense_email_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id
  from public.expense_email_events
  where id = p_event_id;

  if v_company_id is null then raise exception 'Evento não encontrado'; end if;
  if not public.has_company_role(v_company_id, auth.uid(), 'dono'::public.app_role) then
    raise exception 'Somente o proprietário pode ignorar despesas recebidas por e-mail';
  end if;

  update public.expense_email_events
  set status = 'ignored',
      error = 'Ignorado manualmente pelo proprietário',
      processed_at = now()
  where id = p_event_id;
end;
$$;

revoke all on function public.ignore_expense_email_event(uuid) from public, anon;
grant execute on function public.ignore_expense_email_event(uuid) to authenticated;
