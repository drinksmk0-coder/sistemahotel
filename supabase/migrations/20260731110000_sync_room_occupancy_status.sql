-- A presença do hóspede prevalece sobre marcações antigas de limpeza/limpo.
-- O quarto só sai de ocupado quando o check-out é confirmado ou a estadia é cancelada.
create or replace function public.sync_room_occupancy_from_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('ocupado', 'saida_pendente') then
    update public.rooms
       set situacao = 'ocupado'
     where company_id = new.company_id
       and numero = new.quarto
       and coalesce(situacao, '') <> 'manutencao';
  elsif old.status in ('ocupado', 'saida_pendente')
        and new.status = 'cancelado' then
    update public.rooms
       set situacao = 'limpeza'
     where company_id = new.company_id
       and numero = new.quarto
       and coalesce(situacao, '') <> 'manutencao'
       and not exists (
         select 1
           from public.reservations as active_reservation
          where active_reservation.company_id = new.company_id
            and active_reservation.quarto = new.quarto
            and active_reservation.id <> new.id
            and active_reservation.status in ('ocupado', 'saida_pendente')
       );
  end if;

  return new;
end;
$$;

revoke all on function public.sync_room_occupancy_from_reservation() from public, anon, authenticated;

drop trigger if exists reservations_sync_room_occupancy on public.reservations;
create trigger reservations_sync_room_occupancy
after insert or update of status, quarto on public.reservations
for each row execute function public.sync_room_occupancy_from_reservation();

-- Corrige imediatamente inconsistências já existentes.
update public.rooms as room
   set situacao = 'ocupado'
 where coalesce(room.situacao, '') <> 'manutencao'
   and exists (
     select 1
       from public.reservations as reservation
      where reservation.company_id = room.company_id
        and reservation.quarto = room.numero
        and reservation.status in ('ocupado', 'saida_pendente')
        and reservation.checkout_at is null
   );
