-- Preserva a origem internacional do hóspede e o código dos canais importados.
alter table public.clients
  add column if not exists pais text not null default 'Brasil';

alter table public.reservations
  add column if not exists codigo_externo text;

create unique index if not exists reservations_company_external_stay_unique
  on public.reservations (company_id, codigo_externo, quarto, checkin, checkout)
  where codigo_externo is not null;

comment on column public.clients.pais is
  'País de origem do hóspede para segmentação e mapa mundial.';

comment on column public.reservations.codigo_externo is
  'Código da reserva no canal de origem, por exemplo WH, BO, FO ou HO.';
