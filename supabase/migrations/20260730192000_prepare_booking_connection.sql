-- Mantém a integração Booking preparada, porém bloqueada até a autorização oficial.
create unique index if not exists company_integrations_one_booking_per_company
  on public.company_integrations (company_id)
  where tipo = 'booking';

create or replace function public.guard_booking_activation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_property_id text;
begin
  if new.tipo <> 'booking' then
    return new;
  end if;

  new.configuracao := coalesce(new.configuracao, '{}'::jsonb);
  v_status := lower(coalesce(new.configuracao ->> 'connection_status', ''));
  v_property_id := coalesce(
    nullif(trim(coalesce(new.identificador, '')), ''),
    nullif(trim(coalesce(new.configuracao ->> 'hotel_id', '')), ''),
    nullif(trim(coalesce(new.configuracao ->> 'property_id', '')), '')
  );

  if new.ativo and (
    v_status <> 'confirmed'
    or v_property_id is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'A integração Booking só pode ser ativada após a confirmação oficial do provedor e o cadastro do ID da propriedade.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_booking_activation_trigger
  on public.company_integrations;

create trigger guard_booking_activation_trigger
before insert or update of tipo, ativo, identificador, configuracao
on public.company_integrations
for each row
execute function public.guard_booking_activation();

insert into public.company_integrations (
  company_id,
  tipo,
  nome,
  identificador,
  webhook_url,
  ativo,
  configuracao,
  observacoes
)
select
  c.id,
  'booking',
  'Booking.com — aguardando conexão oficial',
  null,
  null,
  false,
  jsonb_build_object(
    'connection_status', 'awaiting_provider',
    'property_id', null,
    'hotel_id', null,
    'partner_id', null,
    'connectivity_provider', null,
    'machine_account_client_id', null,
    'room_mapping_complete', false,
    'sync_reservations', true,
    'sync_availability', true,
    'sync_rates', true,
    'sync_cancellations', true,
    'sync_messages', false,
    'commission_rate_estimate', 13,
    'credentials_location', 'supabase_secrets',
    'last_sync_at', null
  ),
  'Estrutura preparada. Mantenha inativa até a Booking.com ou um Channel Manager homologado confirmar a conexão e fornecer as credenciais oficiais.'
from public.companies c
where not exists (
  select 1
  from public.company_integrations ci
  where ci.company_id = c.id
    and ci.tipo = 'booking'
);

comment on function public.guard_booking_activation() is
  'Impede ativação acidental da Booking antes da confirmação oficial e do ID da propriedade.';
