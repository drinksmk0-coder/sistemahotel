-- Testes transacionais de isolamento multiempresa e bloqueio anônimo.
-- Executar em staging. A transação é revertida no final.
begin;

insert into public.companies (id, nome, slug, created_by)
values (
  '11111111-1111-4111-8111-111111111111',
  'Empresa RLS Temporária',
  'rls-temp-empresa',
  '4d957782-bb70-4fe3-8453-c37715e671b7'
);

-- Um usuário da empresa real não pode enxergar a empresa temporária.
set local role authenticated;
select set_config('request.jwt.claim.sub', '4d957782-bb70-4fe3-8453-c37715e671b7', true);

do $$
begin
  if exists (
    select 1
    from public.companies
    where id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'Falha de isolamento: empresa estrangeira ficou visível';
  end if;
end $$;

reset role;

-- Usuários anônimos não podem inserir reclamações ou avaliações escolhendo company_id.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

do $$
begin
  begin
    insert into public.complaints (
      company_id, categoria, descricao, gravidade, origem, status
    ) values (
      '11111111-1111-4111-8111-111111111111',
      'outros',
      'inserção anônima arbitrária',
      'media',
      'equipe',
      'aberto'
    );
    raise exception 'Falha de segurança: reclamação anônima arbitrária permitida';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.feedbacks (company_id, nota_geral, comentario)
    values (
      '11111111-1111-4111-8111-111111111111',
      1,
      'avaliação anônima arbitrária'
    );
    raise exception 'Falha de segurança: avaliação anônima arbitrária permitida';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
