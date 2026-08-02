create or replace function public.water_consumption_report(
  p_company_id uuid,
  p_start date,
  p_end date,
  p_client_id uuid,
  p_compatibility_guard boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Relatório protegido: selecione uma empresa cadastrada na versão atual do sistema.';
end;
$$;

revoke all on function public.water_consumption_report(uuid, date, date, uuid, boolean) from public;
revoke all on function public.water_consumption_report(uuid, date, date, uuid, boolean) from anon;
grant execute on function public.water_consumption_report(uuid, date, date, uuid, boolean) to authenticated;
