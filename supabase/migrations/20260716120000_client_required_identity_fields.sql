-- Regras de cadastro do hóspede.
-- NOT VALID evita quebrar dados antigos incompletos, mas passa a proteger novos cadastros.

alter table public.clients
  add constraint clients_nome_sem_numeros
  check (nome !~ '[0-9]' and length(trim(nome)) >= 5) not valid;

alter table public.clients
  add constraint clients_cpf_obrigatorio_11_digitos
  check (cpf is not null and length(regexp_replace(cpf, '\D', '', 'g')) = 11) not valid;

alter table public.clients
  add constraint clients_telefone_obrigatorio_com_ddd
  check (telefone is not null and length(regexp_replace(telefone, '\D', '', 'g')) >= 10) not valid;

alter table public.clients
  add constraint clients_nascimento_obrigatorio
  check (data_nascimento is not null) not valid;

alter table public.clients
  add constraint clients_estado_obrigatorio
  check (estado is not null and length(trim(estado)) = 2) not valid;

alter table public.clients
  add constraint clients_estado_civil_obrigatorio
  check (estado_civil is not null and length(trim(estado_civil)) > 0) not valid;
