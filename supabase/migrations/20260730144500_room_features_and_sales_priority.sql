alter table public.rooms
  add column if not exists frigobar boolean not null default false,
  add column if not exists tv_smart boolean not null default false,
  add column if not exists vista text not null default 'nao_informada',
  add column if not exists nivel_ruido text not null default 'nao_informado',
  add column if not exists ventilacao text not null default 'nao_informada',
  add column if not exists tamanho_banheiro text not null default 'nao_informado',
  add column if not exists prioridade_venda smallint not null default 2,
  add column if not exists observacoes_quarto text;

alter table public.rooms drop constraint if exists rooms_vista_check;
alter table public.rooms add constraint rooms_vista_check
  check (vista in ('rua','lateral','fundos','interna','nao_informada'));

alter table public.rooms drop constraint if exists rooms_nivel_ruido_check;
alter table public.rooms add constraint rooms_nivel_ruido_check
  check (nivel_ruido in ('silencioso','moderado','barulhento','nao_informado'));

alter table public.rooms drop constraint if exists rooms_ventilacao_check;
alter table public.rooms add constraint rooms_ventilacao_check
  check (ventilacao in ('arejada','normal','abafada','nao_informada'));

alter table public.rooms drop constraint if exists rooms_tamanho_banheiro_check;
alter table public.rooms add constraint rooms_tamanho_banheiro_check
  check (tamanho_banheiro in ('pequeno','normal','amplo','nao_informado'));

alter table public.rooms drop constraint if exists rooms_prioridade_venda_check;
alter table public.rooms add constraint rooms_prioridade_venda_check
  check (prioridade_venda between 1 and 3);

comment on column public.rooms.frigobar is 'Indica se o quarto possui frigobar.';
comment on column public.rooms.tv_smart is 'Indica se o quarto possui Smart TV.';
comment on column public.rooms.vista is 'Posição ou vista principal do quarto.';
comment on column public.rooms.nivel_ruido is 'Percepção operacional do nível de ruído.';
comment on column public.rooms.ventilacao is 'Percepção operacional da ventilação.';
comment on column public.rooms.tamanho_banheiro is 'Classificação operacional do tamanho do banheiro.';
comment on column public.rooms.prioridade_venda is '1 priorizar, 2 normal, 3 vender por último.';
comment on column public.rooms.observacoes_quarto is 'Observações internas sobre peculiaridades do quarto.';

create index if not exists rooms_company_priority_idx
  on public.rooms (company_id, prioridade_venda, numero);
