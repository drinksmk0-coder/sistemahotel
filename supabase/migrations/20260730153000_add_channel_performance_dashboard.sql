create or replace function public.dashboard_channel_performance(
  p_company_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.is_company_member(p_company_id, auth.uid()) then
    raise exception 'Acesso negado à empresa';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 730 then
    raise exception 'Período inválido';
  end if;

  with
  params as (
    select
      p_start::date as current_start,
      p_end::date as current_end,
      case
        when p_start = p_end then p_start - 1
        when p_start = date_trunc('month', p_start)::date
          and p_end = (date_trunc('month', p_start) + interval '1 month - 1 day')::date
          then (p_start - interval '1 month')::date
        when p_start = make_date(extract(year from p_start)::int, 1, 1)
          and p_end = make_date(extract(year from p_start)::int, 12, 31)
          then make_date(extract(year from p_start)::int - 1, 1, 1)
        else p_start - (p_end - p_start + 1)
      end as previous_start,
      case when p_start = p_end then p_start - 1 else p_start - 1 end as previous_end,
      case when p_end - p_start > 62 then 'month' else 'day' end as bucket_mode
  ),
  reservation_base as (
    select
      r.*,
      case
        when lower(coalesce(r.canal,'')) like '%booking%' then 'Booking'
        when lower(coalesce(r.canal,'')) like '%airbnb%' then 'Airbnb'
        when lower(coalesce(r.canal,'')) like '%whats%' then 'WhatsApp'
        when lower(coalesce(r.canal,'')) like '%site%'
          or lower(coalesce(r.canal,'')) like '%web%' then 'Site'
        when lower(coalesce(r.canal,'')) like '%insta%' then 'Instagram'
        when lower(coalesce(r.canal,'')) like '%balc%'
          or lower(coalesce(r.canal,'')) like '%recep%'
          or lower(coalesce(r.canal,'')) like '%telefon%'
          or lower(coalesce(r.canal,'')) like '%presencial%' then 'Balcão / telefone'
        when trim(coalesce(r.canal,'')) = ''
          or lower(trim(coalesce(r.canal,''))) = 'direto' then 'Direto não detalhado'
        else 'Outros'
      end as channel_group,
      case
        when r.checkin between p.current_start and p.current_end then 'current'
        when r.checkin between p.previous_start and p.previous_end then 'previous'
        else null
      end as period_key
    from public.reservations r
    cross join params p
    where r.company_id = p_company_id
      and r.checkin between p.previous_start and p.current_end
      and coalesce(r.status,'') <> 'manutencao'
  ),
  channel_metrics as (
    select
      period_key,
      channel_group,
      count(*)::numeric as reservations,
      count(*) filter (where status = 'cancelado')::numeric as cancellations,
      count(*) filter (where status <> 'cancelado')::numeric as confirmed_reservations,
      coalesce(sum(coalesce(valor_total,0)) filter (where status <> 'cancelado'),0)::numeric as gross_revenue,
      coalesce(sum(coalesce(valor_pago,0)) filter (where status <> 'cancelado'),0)::numeric as received_revenue
    from reservation_base
    where period_key is not null
    group by 1,2
  ),
  channel_enriched as (
    select
      *,
      case when channel_group='Booking' then 0.13 when channel_group='Airbnb' then 0.03 else 0 end::numeric as commission_rate,
      gross_revenue * case when channel_group='Booking' then 0.13 when channel_group='Airbnb' then 0.03 else 0 end::numeric as estimated_commission,
      gross_revenue * (1 - case when channel_group='Booking' then 0.13 when channel_group='Airbnb' then 0.03 else 0 end::numeric) as net_revenue,
      case when confirmed_reservations > 0 then gross_revenue / confirmed_reservations else 0 end as average_ticket
    from channel_metrics
  ),
  period_totals as (
    select
      period_key,
      coalesce(sum(reservations),0)::numeric as total_reservations,
      coalesce(sum(reservations) filter (where channel_group='Booking'),0)::numeric as booking_reservations,
      coalesce(sum(reservations) filter (where channel_group not in ('Booking','Airbnb')),0)::numeric as direct_reservations,
      coalesce(sum(cancellations),0)::numeric as cancellations,
      coalesce(sum(gross_revenue),0)::numeric as gross_revenue,
      coalesce(sum(gross_revenue) filter (where channel_group='Booking'),0)::numeric as booking_revenue,
      coalesce(sum(gross_revenue) filter (where channel_group not in ('Booking','Airbnb')),0)::numeric as direct_revenue,
      coalesce(sum(estimated_commission),0)::numeric as estimated_commission,
      coalesce(sum(estimated_commission) filter (where channel_group='Booking'),0)::numeric as booking_commission,
      coalesce(sum(net_revenue),0)::numeric as net_revenue,
      coalesce(sum(confirmed_reservations) filter (where channel_group='Booking'),0)::numeric as booking_confirmed,
      coalesce(sum(confirmed_reservations) filter (where channel_group not in ('Booking','Airbnb')),0)::numeric as direct_confirmed
    from channel_enriched
    group by period_key
  ),
  total_objects as (
    select
      period_key,
      jsonb_build_object(
        'totalReservations', total_reservations,
        'bookingReservations', booking_reservations,
        'directReservations', direct_reservations,
        'cancellations', cancellations,
        'grossRevenue', gross_revenue,
        'bookingRevenue', booking_revenue,
        'directRevenue', direct_revenue,
        'estimatedCommission', estimated_commission,
        'bookingCommission', booking_commission,
        'netRevenue', net_revenue,
        'bookingDependencyReservations', case when total_reservations>0 then booking_reservations*100/total_reservations else 0 end,
        'bookingDependencyRevenue', case when gross_revenue>0 then booking_revenue*100/gross_revenue else 0 end,
        'bookingAverageTicket', case when booking_confirmed>0 then booking_revenue/booking_confirmed else 0 end,
        'directAverageTicket', case when direct_confirmed>0 then direct_revenue/direct_confirmed else 0 end
      ) as value
    from period_totals
  ),
  current_total as (
    select coalesce((select value from total_objects where period_key='current'), jsonb_build_object(
      'totalReservations',0,'bookingReservations',0,'directReservations',0,'cancellations',0,
      'grossRevenue',0,'bookingRevenue',0,'directRevenue',0,'estimatedCommission',0,
      'bookingCommission',0,'netRevenue',0,'bookingDependencyReservations',0,
      'bookingDependencyRevenue',0,'bookingAverageTicket',0,'directAverageTicket',0
    )) as value
  ),
  previous_total as (
    select coalesce((select value from total_objects where period_key='previous'), jsonb_build_object(
      'totalReservations',0,'bookingReservations',0,'directReservations',0,'cancellations',0,
      'grossRevenue',0,'bookingRevenue',0,'directRevenue',0,'estimatedCommission',0,
      'bookingCommission',0,'netRevenue',0,'bookingDependencyReservations',0,
      'bookingDependencyRevenue',0,'bookingAverageTicket',0,'directAverageTicket',0
    )) as value
  ),
  current_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name',channel_group,
      'reservations',reservations,
      'cancellations',cancellations,
      'confirmedReservations',confirmed_reservations,
      'grossRevenue',gross_revenue,
      'receivedRevenue',received_revenue,
      'commissionRate',commission_rate*100,
      'estimatedCommission',estimated_commission,
      'netRevenue',net_revenue,
      'averageTicket',average_ticket
    ) order by gross_revenue desc),'[]'::jsonb) as rows
    from channel_enriched where period_key='current'
  ),
  previous_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name',channel_group,
      'reservations',reservations,
      'cancellations',cancellations,
      'confirmedReservations',confirmed_reservations,
      'grossRevenue',gross_revenue,
      'receivedRevenue',received_revenue,
      'commissionRate',commission_rate*100,
      'estimatedCommission',estimated_commission,
      'netRevenue',net_revenue,
      'averageTicket',average_ticket
    ) order by gross_revenue desc),'[]'::jsonb) as rows
    from channel_enriched where period_key='previous'
  ),
  current_series_raw as (
    select
      case when p.bucket_mode='month' then date_trunc('month',r.checkin)::date else r.checkin::date end as bucket,
      sum(coalesce(r.valor_total,0)) filter (where r.status<>'cancelado' and r.channel_group='Booking')::numeric as booking_revenue,
      sum(coalesce(r.valor_total,0)) filter (where r.status<>'cancelado' and r.channel_group not in ('Booking','Airbnb'))::numeric as direct_revenue,
      count(*) filter (where r.channel_group='Booking')::numeric as booking_reservations,
      count(*) filter (where r.channel_group not in ('Booking','Airbnb'))::numeric as direct_reservations
    from reservation_base r cross join params p
    where r.period_key='current'
    group by 1,p.bucket_mode
  ),
  current_series as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'date',bucket,
      'label',case when p.bucket_mode='month' then to_char(bucket,'Mon/YY') else to_char(bucket,'DD/MM') end,
      'bookingRevenue',coalesce(booking_revenue,0),
      'directRevenue',coalesce(direct_revenue,0),
      'bookingReservations',coalesce(booking_reservations,0),
      'directReservations',coalesce(direct_reservations,0)
    ) order by bucket),'[]'::jsonb) as rows
    from current_series_raw cross join params p
  )
  select jsonb_build_object(
    'currentRange', jsonb_build_object('start',p.current_start,'end',p.current_end),
    'previousRange', jsonb_build_object('start',p.previous_start,'end',p.previous_end),
    'current',ct.value,
    'previous',pt.value,
    'currentRows',cr.rows,
    'previousRows',pr.rows,
    'series',cs.rows,
    'commissionDisclosure','Comissão estimada: Booking 13% e Airbnb 3%. Substituir pelo valor real quando a integração oficial estiver ativa.'
  ) into result
  from params p, current_total ct, previous_total pt, current_rows cr, previous_rows pr, current_series cs;

  return result;
end;
$$;

revoke all on function public.dashboard_channel_performance(uuid,date,date) from public, anon;
grant execute on function public.dashboard_channel_performance(uuid,date,date) to authenticated;
