alter table public.rooms
  add column if not exists proximo_garagem boolean,
  add column if not exists parede_frente_janela boolean,
  add column if not exists tipo_janela text not null default 'nao_informado',
  add column if not exists tamanho_janela text not null default 'nao_informado',
  add column if not exists tamanho_quarto text not null default 'nao_informado',
  add column if not exists acesso_escadas text not null default 'nao_informado',
  add column if not exists ventilador boolean not null default true;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rooms_tipo_janela_check') then
    alter table public.rooms add constraint rooms_tipo_janela_check
      check (tipo_janela in ('madeira','vidro','mista','nao_informado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_tamanho_janela_check') then
    alter table public.rooms add constraint rooms_tamanho_janela_check
      check (tamanho_janela in ('pequena','media','grande','nao_informado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_tamanho_quarto_check') then
    alter table public.rooms add constraint rooms_tamanho_quarto_check
      check (tamanho_quarto in ('compacto','normal','espacoso','nao_informado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rooms_acesso_escadas_check') then
    alter table public.rooms add constraint rooms_acesso_escadas_check
      check (acesso_escadas in ('sem_escadas','subir','descer','nao_informado'));
  end if;
end $$;

comment on column public.rooms.ventilacao is
  'Percepção confirmada da ventilação; não deve ser inferida apenas pela existência de ventilador ou tamanho da janela.';
comment on column public.rooms.parede_frente_janela is
  'Indica se existe uma parede próxima em frente à janela, reduzindo abertura ou vista.';

update public.rooms
set tamanho_quarto = 'espacoso',
    tipo_janela = 'madeira',
    tamanho_janela = 'grande',
    ventilador = true
where numero = 222;
