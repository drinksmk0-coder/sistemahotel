-- Permanently delete clients and their operational history in one transaction.
-- Only an active company owner can execute this function.
create or replace function public.delete_clients_with_history(
  p_company_id uuid,
  p_client_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_client_ids uuid[];
  target_reservation_ids uuid[];
  deleted_clients integer := 0;
  deleted_reservations integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not public.has_company_role(p_company_id, auth.uid(), 'dono'::public.app_role) then
    raise exception 'Somente o dono da empresa pode excluir clientes definitivamente.';
  end if;

  select coalesce(array_agg(client.id), '{}'::uuid[])
    into target_client_ids
  from public.clients as client
  where client.company_id = p_company_id
    and client.id = any(coalesce(p_client_ids, '{}'::uuid[]));

  if cardinality(target_client_ids) = 0 then
    return jsonb_build_object('clients_deleted', 0, 'reservations_deleted', 0);
  end if;

  select coalesce(array_agg(reservation.id), '{}'::uuid[])
    into target_reservation_ids
  from public.reservations as reservation
  where reservation.company_id = p_company_id
    and reservation.cliente_id = any(target_client_ids);

  delete from public.integration_events
  where company_id = p_company_id
    and reservation_id = any(target_reservation_ids);

  delete from public.guest_payments
  where company_id = p_company_id
    and (
      cliente_id = any(target_client_ids)
      or reservation_id = any(target_reservation_ids)
    );

  delete from public.guest_checkins
  where company_id = p_company_id
    and (
      client_id = any(target_client_ids)
      or reservation_id = any(target_reservation_ids)
    );

  delete from public.sales
  where company_id = p_company_id
    and (
      cliente_id = any(target_client_ids)
      or reserva_id = any(target_reservation_ids)
    );

  delete from public.reservations
  where company_id = p_company_id
    and id = any(target_reservation_ids);
  get diagnostics deleted_reservations = row_count;

  delete from public.clients
  where company_id = p_company_id
    and id = any(target_client_ids);
  get diagnostics deleted_clients = row_count;

  return jsonb_build_object(
    'clients_deleted', deleted_clients,
    'reservations_deleted', deleted_reservations
  );
end;
$$;

revoke all on function public.delete_clients_with_history(uuid, uuid[]) from public;
revoke all on function public.delete_clients_with_history(uuid, uuid[]) from anon;
grant execute on function public.delete_clients_with_history(uuid, uuid[]) to authenticated;
