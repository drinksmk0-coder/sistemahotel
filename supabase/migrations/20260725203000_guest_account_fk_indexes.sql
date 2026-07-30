-- Índices diretos para consultas e manutenção das chaves estrangeiras da conta do hóspede.

create index if not exists sales_reserva_id_idx
  on public.sales (reserva_id);
create index if not exists sales_cliente_id_idx
  on public.sales (cliente_id);

create index if not exists guest_payments_reservation_id_idx
  on public.guest_payments (reservation_id);
create index if not exists guest_payments_cliente_id_idx
  on public.guest_payments (cliente_id);
create index if not exists guest_payments_created_by_idx
  on public.guest_payments (created_by);

create index if not exists system_issues_created_by_idx
  on public.system_issues (created_by);
