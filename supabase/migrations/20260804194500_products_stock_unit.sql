-- Unidade usada no controle físico do produto (unidade, caixa, pacote etc.).
-- Alteração aditiva: não remove nem recalcula registros existentes.
alter table public.products
  add column if not exists unidade text not null default 'unidade';

alter table public.products
  drop constraint if exists products_unidade_check;

alter table public.products
  add constraint products_unidade_check
  check (unidade in ('unidade', 'caixa', 'pacote', 'fardo', 'garrafa', 'lata', 'quilo', 'litro'));

update public.products
set unidade = 'unidade'
where unidade is null or trim(unidade) = '';
