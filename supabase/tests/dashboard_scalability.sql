-- Execute em staging. Todos os dados temporários são revertidos.
begin;

-- Usuário real da empresa piloto.
set local role authenticated;
select set_config('request.jwt.claim.sub','4d957782-bb70-4fe3-8453-c37715e671b7',true);

-- O RPC deve retornar somente agregados pequenos, não registros brutos.
do $$
declare
  payload jsonb;
begin
  payload := public.dashboard_strategic_aggregates(
    'c7a75694-06af-440c-a788-092dbfe51385',
    date '2026-07-01',
    date '2026-07-31'
  );
  if jsonb_typeof(payload->'summary') <> 'object' then
    raise exception 'Resumo estratégico inválido';
  end if;
  if jsonb_array_length(payload->'financialSeries') <> 31 then
    raise exception 'Série diária incompleta';
  end if;
end $$;

-- Períodos excessivos devem ser rejeitados para evitar consultas abusivas.
do $$
begin
  begin
    perform public.dashboard_strategic_aggregates(
      'c7a75694-06af-440c-a788-092dbfe51385',
      date '2020-01-01',
      date '2026-07-31'
    );
    raise exception 'Período excessivo foi aceito';
  exception when others then
    if sqlerrm = 'Período excessivo foi aceito' then raise; end if;
  end;
end $$;

reset role;

-- Empresa temporária sem vínculo com o usuário.
insert into public.companies (id,nome,slug,created_by)
values ('22222222-2222-4222-8222-222222222222','Empresa Escala Temporária','escala-temp','4d957782-bb70-4fe3-8453-c37715e671b7');

set local role authenticated;
select set_config('request.jwt.claim.sub','4d957782-bb70-4fe3-8453-c37715e671b7',true);
do $$
begin
  begin
    perform public.dashboard_strategic_aggregates(
      '22222222-2222-4222-8222-222222222222',
      current_date - 30,
      current_date
    );
    raise exception 'RPC permitiu empresa sem associação';
  exception when others then
    if sqlerrm = 'RPC permitiu empresa sem associação' then raise; end if;
  end;
end $$;

rollback;
