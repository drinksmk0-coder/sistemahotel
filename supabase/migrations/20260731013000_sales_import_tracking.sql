alter table public.sales
  add column if not exists import_source text,
  add column if not exists external_code text;

create unique index if not exists sales_company_import_external_uidx
  on public.sales (
    company_id,
    lower(trim(import_source)),
    lower(trim(external_code))
  )
  where import_source is not null
    and trim(import_source) <> ''
    and external_code is not null
    and trim(external_code) <> '';

comment on column public.sales.import_source is
  'Origem declarada de uma venda importada, por exemplo Hospedin financeiro.';
comment on column public.sales.external_code is
  'Identificador estável da linha na origem para impedir reimportações.';
