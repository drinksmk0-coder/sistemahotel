create or replace function public.sync_client_name_to_reservations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nome is distinct from old.nome then
    update public.reservations
       set cliente_nome = new.nome
     where cliente_id = new.id
       and company_id = new.company_id
       and cliente_nome is distinct from new.nome;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_sync_reservation_name on public.clients;
create trigger trg_clients_sync_reservation_name
after update of nome on public.clients
for each row execute function public.sync_client_name_to_reservations();

update public.reservations r
   set cliente_nome = c.nome
  from public.clients c
 where r.cliente_id = c.id
   and r.company_id = c.company_id
   and r.cliente_nome is distinct from c.nome;
