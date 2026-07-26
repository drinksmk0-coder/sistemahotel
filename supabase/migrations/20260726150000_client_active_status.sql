-- Mantém o status operacional separado da classificação comercial do cliente.
alter table public.clients
  add column if not exists ativo boolean not null default true;

update public.clients
set
  ativo = false,
  tipo = coalesce(nullif(regexp_replace(tipo, '^desativado:', ''), ''), 'hóspede normal')
where tipo like 'desativado:%';

create index if not exists clients_company_active_name_idx
  on public.clients (company_id, ativo, nome);
