-- Testes manuais de segurança para a fila de automações com IA.
-- Executar em ambiente de homologação após aplicar as migrations.

begin;

-- 1. Ações críticas nunca podem dispensar confirmação humana.
do $$
begin
  begin
    insert into public.ai_automation_queue (
      company_id,
      source,
      action_type,
      requires_human_confirmation,
      payload
    ) values (
      '00000000-0000-0000-0000-000000000000',
      'security-test',
      'reservation_cancel',
      false,
      '{}'::jsonb
    );
    raise exception 'FALHA: cancelamento sem confirmação humana foi aceito';
  exception
    when check_violation or foreign_key_violation then
      null;
  end;
end $$;

-- 2. Não deve existir política DELETE para usuários autenticados.
do $$
declare
  delete_policy_count integer;
begin
  select count(*)
    into delete_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'ai_automation_queue'
    and cmd = 'DELETE';

  if delete_policy_count <> 0 then
    raise exception 'FALHA: existe política DELETE na fila de automações';
  end if;
end $$;

-- 3. A política de UPDATE deve exigir papel dono.
do $$
declare
  owner_policy text;
begin
  select coalesce(qual, '') || ' ' || coalesce(with_check, '')
    into owner_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'ai_automation_queue'
    and policyname = 'company owners can review automation queue';

  if owner_policy is null or position('has_company_role' in owner_policy) = 0 then
    raise exception 'FALHA: política de revisão não exige papel de proprietário';
  end if;
end $$;

rollback;
