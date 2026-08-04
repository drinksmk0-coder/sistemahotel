-- Detalhes de embalagem para produtos comprados em fardos, caixas, pacotes ou engradados.
-- Migração aditiva: não remove nem altera saldos existentes.

alter table public.products
  add column if not exists embalagem text not null default 'unidade',
  add column if not exists unidades_por_embalagem integer not null default 1;

alter table public.products drop constraint if exists products_unidades_por_embalagem_check;
alter table public.products
  add constraint products_unidades_por_embalagem_check
  check (unidades_por_embalagem > 0);

comment on column public.products.embalagem is
  'Tipo de embalagem de compra, por exemplo fardo, caixa, pacote, engradado ou unidade.';
comment on column public.products.unidades_por_embalagem is
  'Quantidade de unidades vendáveis contidas em cada embalagem de compra.';
