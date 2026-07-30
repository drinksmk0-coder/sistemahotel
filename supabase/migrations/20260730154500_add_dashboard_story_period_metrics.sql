create or replace function public.dashboard_story_period_metrics(
  p_company_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with room_stats as (
    select count(*)::numeric as room_count
    from public.rooms
    where company_id=p_company_id and numero<900 and coalesce(situacao,'')<>'manutencao'
  ),
  reservation_rows as (
    select r.*,
      greatest(0,least(r.checkout,p_end+1)-greatest(r.checkin,p_start))::numeric as nights_in_range
    from public.reservations r
    where r.company_id=p_company_id
      and r.checkin<=p_end and r.checkout>=p_start
      and coalesce(r.status,'')<>'manutencao'
  ),
  reservation_metrics as (
    select
      count(*)::numeric as total_reservations,
      count(*) filter(where status<>'cancelado')::numeric as confirmed_reservations,
      count(*) filter(where status='cancelado')::numeric as cancellations,
      coalesce(sum(coalesce(valor_total,0)) filter(where status='cancelado'),0)::numeric as cancellation_value,
      coalesce(sum(coalesce(valor_total,0)) filter(where status<>'cancelado'),0)::numeric as gross_reserved,
      coalesce(sum(coalesce(valor_pago,0)) filter(where status<>'cancelado'),0)::numeric as received,
      coalesce(sum(greatest(coalesce(valor_total,0)-coalesce(valor_pago,0),0)) filter(where status<>'cancelado'),0)::numeric as outstanding,
      count(*) filter(where status<>'cancelado' and coalesce(valor_total,0)>coalesce(valor_pago,0))::numeric as debt_reservations,
      coalesce(sum(greatest(coalesce(pessoas,1),1)) filter(where status<>'cancelado'),0)::numeric as guest_persons,
      coalesce(sum(nights_in_range) filter(where status<>'cancelado'),0)::numeric as sold_room_nights,
      coalesce(sum(coalesce(valor_pago,0)) filter(where status<>'cancelado'),0)::numeric as lodging_revenue
    from reservation_rows
  ),
  sales_metrics as (
    select
      coalesce(sum(coalesce(total,0)) filter(where not (lower(coalesce(categoria,'')||' '||coalesce(item,'')) ~ '(lavander|lavagem|camareira|servi[cç]o|late.?check|early.?check|estacionamento|transfer|passeio)')),0)::numeric as product_revenue,
      coalesce(sum(coalesce(total,0)) filter(where lower(coalesce(categoria,'')||' '||coalesce(item,'')) ~ '(lavander|lavagem|camareira|servi[cç]o|late.?check|early.?check|estacionamento|transfer|passeio)'),0)::numeric as service_revenue
    from public.sales
    where company_id=p_company_id and data between p_start and p_end
  ),
  expense_metrics as (
    select coalesce(sum(coalesce(valor,0)),0)::numeric as expenses
    from public.expenses
    where company_id=p_company_id and data between p_start and p_end
  )
  select jsonb_build_object(
    'totalReservations',rm.total_reservations,
    'confirmedReservations',rm.confirmed_reservations,
    'cancellations',rm.cancellations,
    'cancellationValue',rm.cancellation_value,
    'cancellationRate',case when rm.total_reservations>0 then rm.cancellations*100/rm.total_reservations else 0 end,
    'cancellationRevenueShare',case when rm.gross_reserved+rm.cancellation_value>0 then rm.cancellation_value*100/(rm.gross_reserved+rm.cancellation_value) else 0 end,
    'grossReserved',rm.gross_reserved,
    'received',rm.received,
    'outstanding',rm.outstanding,
    'debtReservations',rm.debt_reservations,
    'debtReservationShare',case when rm.confirmed_reservations>0 then rm.debt_reservations*100/rm.confirmed_reservations else 0 end,
    'outstandingShare',case when rm.gross_reserved>0 then rm.outstanding*100/rm.gross_reserved else 0 end,
    'guestPersons',rm.guest_persons,
    'soldRoomNights',rm.sold_room_nights,
    'availableRoomNights',rs.room_count*greatest(1,p_end-p_start+1),
    'occupancyRate',case when rs.room_count*greatest(1,p_end-p_start+1)>0 then rm.sold_room_nights*100/(rs.room_count*greatest(1,p_end-p_start+1)) else 0 end,
    'lodgingRevenue',rm.lodging_revenue,
    'productRevenue',sm.product_revenue,
    'serviceRevenue',sm.service_revenue,
    'totalRevenue',rm.lodging_revenue+sm.product_revenue+sm.service_revenue,
    'expenses',em.expenses,
    'gop',rm.lodging_revenue+sm.product_revenue+sm.service_revenue-em.expenses,
    'trevpar',case when rs.room_count*greatest(1,p_end-p_start+1)>0 then (rm.lodging_revenue+sm.product_revenue+sm.service_revenue)/(rs.room_count*greatest(1,p_end-p_start+1)) else 0 end,
    'goppar',case when rs.room_count*greatest(1,p_end-p_start+1)>0 then (rm.lodging_revenue+sm.product_revenue+sm.service_revenue-em.expenses)/(rs.room_count*greatest(1,p_end-p_start+1)) else 0 end,
    'revenuePerGuest',case when rm.guest_persons>0 then (rm.lodging_revenue+sm.product_revenue+sm.service_revenue)/rm.guest_persons else 0 end
  )
  from room_stats rs,reservation_metrics rm,sales_metrics sm,expense_metrics em;
$$;

revoke all on function public.dashboard_story_period_metrics(uuid,date,date) from public,anon;
grant execute on function public.dashboard_story_period_metrics(uuid,date,date) to authenticated;
