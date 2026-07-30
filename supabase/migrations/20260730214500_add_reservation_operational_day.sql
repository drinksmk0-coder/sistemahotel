create or replace function public.hotel_operational_date(
  p_at timestamptz default now()
)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (((p_at at time zone 'America/Sao_Paulo') - interval '6 hours')::date);
$$;

alter table public.reservations
  add column if not exists data_reserva date;

update public.reservations
set data_reserva = public.hotel_operational_date(created_at)
where data_reserva is null;

alter table public.reservations
  alter column data_reserva set default public.hotel_operational_date(now()),
  alter column data_reserva set not null,
  alter column horario_reserva set default ((now() at time zone 'America/Sao_Paulo')::time),
  alter column horario_checkin set default '15:00:00'::time,
  alter column horario_checkout set default '12:00:00'::time;

create or replace function public.set_reservation_operational_defaults()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.data_reserva is null then
    new.data_reserva := public.hotel_operational_date(now());
  end if;

  if new.horario_reserva is null then
    new.horario_reserva := (now() at time zone 'America/Sao_Paulo')::time;
  end if;

  if new.horario_checkin is null then
    new.horario_checkin := '15:00:00'::time;
  end if;

  if new.horario_checkout is null then
    new.horario_checkout := '12:00:00'::time;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_operational_defaults_trigger on public.reservations;
create trigger reservations_operational_defaults_trigger
before insert on public.reservations
for each row
execute function public.set_reservation_operational_defaults();

comment on column public.reservations.data_reserva is
  'Data operacional da reserva. Entre 00:00 e 05:59 no fuso America/Sao_Paulo permanece no dia anterior.';
comment on function public.hotel_operational_date(timestamptz) is
  'Calcula o dia operacional do hotel com virada diária às 06:00 no fuso America/Sao_Paulo.';
