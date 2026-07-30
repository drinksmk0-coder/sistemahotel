create or replace function public.dashboard_strategic_aggregates(
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
    select p_start::date as start_date, p_end::date as end_date,
           greatest(1, (p_end - p_start + 1))::numeric as days_count
  ),
  room_stats as (
    select count(*)::numeric as room_count
    from public.rooms
    where company_id = p_company_id and numero < 900
  ),
  reservations_period as (
    select r.*,
           coalesce(nullif(to_jsonb(r)->>'canal',''), nullif(to_jsonb(r)->>'origem',''), 'Direto') as channel,
           coalesce((to_jsonb(r)->>'no_show')::boolean, false) as is_no_show
    from public.reservations r, params p
    where r.company_id = p_company_id
      and r.checkin <= p.end_date
      and r.checkout >= p.start_date
  ),
  valid_reservations as (
    select * from reservations_period where status not in ('cancelado','manutencao')
  ),
  reservation_metrics as (
    select
      coalesce(sum(greatest(0, least(checkout, p.end_date) - greatest(checkin, p.start_date))),0)::numeric as sold_room_nights,
      coalesce(sum(coalesce(valor_pago,0)),0)::numeric as lodging_revenue,
      count(*) filter (where status = 'cancelado')::numeric as cancellations,
      count(*) filter (where is_no_show)::numeric as no_shows,
      coalesce(avg(greatest(1, checkout - checkin)) filter (where status not in ('cancelado','manutencao')),0)::numeric as avg_stay
    from reservations_period, params p
  ),
  sales_metrics as (
    select coalesce(sum(coalesce(total,0)),0)::numeric as sales_revenue
    from public.sales s, params p
    where s.company_id = p_company_id and s.data between p.start_date and p.end_date
  ),
  expense_metrics as (
    select coalesce(sum(coalesce(valor,0)),0)::numeric as expenses
    from public.expenses e, params p
    where e.company_id = p_company_id and e.data between p.start_date and p.end_date
  ),
  occupancy_now as (
    select count(distinct quarto)::numeric as occupied_now
    from public.reservations
    where company_id = p_company_id
      and status not in ('cancelado','finalizado','manutencao')
      and current_date between checkin and checkout
  ),
  feedback_metrics as (
    select coalesce(avg(nota_geral) filter (where nota_geral is not null),0)::numeric as average_rating,
           count(*)::numeric as feedback_count
    from public.feedbacks f, params p
    where f.company_id = p_company_id and f.created_at::date between p.start_date and p.end_date
  ),
  complaint_metrics as (
    select count(*) filter (where status <> 'resolvido')::numeric as open_complaints
    from public.complaints where company_id = p_company_id
  ),
  clients_metrics as (
    select count(*)::numeric as client_count
    from public.clients where company_id = p_company_id
  ),
  financial_days as (
    select d::date as day,
      coalesce((select sum(coalesce(r.valor_pago,0)) from public.reservations r where r.company_id=p_company_id and r.checkin=d::date and r.status not in ('cancelado','manutencao')),0)::numeric +
      coalesce((select sum(coalesce(s.total,0)) from public.sales s where s.company_id=p_company_id and s.data=d::date),0)::numeric as revenue,
      coalesce((select sum(coalesce(e.valor,0)) from public.expenses e where e.company_id=p_company_id and e.data=d::date),0)::numeric as expenses
    from params p, generate_series(p.start_date, p.end_date, interval '1 day') d
  ),
  financial_series as (
    select coalesce(jsonb_agg(jsonb_build_object('label',to_char(day,'DD/MM'),'date',day,'receita',revenue,'despesas',expenses,'gop',revenue-expenses) order by day),'[]'::jsonb) as rows
    from financial_days
  ),
  channel_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',channel,'value',value,'share',case when total>0 then value*100/total else 0 end) order by value desc),'[]'::jsonb) as rows
    from (
      select channel, sum(coalesce(valor_pago,0))::numeric as value, sum(sum(coalesce(valor_pago,0))) over ()::numeric as total
      from valid_reservations group by channel
    ) q
  ),
  room_type_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc),'[]'::jsonb) as rows
    from (
      select coalesce(nullif(ro.configuracao,''),'Não informado') as name, sum(coalesce(r.valor_pago,0))::numeric as value
      from valid_reservations r left join public.rooms ro on ro.company_id=p_company_id and ro.numero=r.quarto
      group by 1
    ) q
  ),
  expense_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc),'[]'::jsonb) as rows
    from (
      select coalesce(nullif(categoria,''),'Sem categoria') as name, sum(coalesce(valor,0))::numeric as value
      from public.expenses e, params p
      where e.company_id=p_company_id and e.data between p.start_date and p.end_date group by 1
    ) q
  ),
  origin_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc),'[]'::jsonb) as rows
    from (
      select coalesce(nullif(cidade,''),nullif(pais,''),'Não informada') as name, count(*)::numeric as value
      from public.clients where company_id=p_company_id group by 1 order by 2 desc limit 8
    ) q
  ),
  complaint_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc),'[]'::jsonb) as rows
    from (
      select coalesce(nullif(categoria,''),'Outros') as name, count(*)::numeric as value
      from public.complaints where company_id=p_company_id group by 1 order by 2 desc limit 8
    ) q
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'roomCount',rs.room_count,'occupiedNow',onow.occupied_now,
      'availableRooms',greatest(0,rs.room_count-onow.occupied_now),
      'occupancyNow',case when rs.room_count>0 then onow.occupied_now*100/rs.room_count else 0 end,
      'soldRoomNights',rm.sold_room_nights,'availableRoomNights',rs.room_count*p.days_count,
      'occupancyRate',case when rs.room_count*p.days_count>0 then rm.sold_room_nights*100/(rs.room_count*p.days_count) else 0 end,
      'lodgingRevenue',rm.lodging_revenue,'salesRevenue',sm.sales_revenue,
      'revenue',rm.lodging_revenue+sm.sales_revenue,'expenses',em.expenses,
      'gop',rm.lodging_revenue+sm.sales_revenue-em.expenses,
      'margin',case when rm.lodging_revenue+sm.sales_revenue>0 then (rm.lodging_revenue+sm.sales_revenue-em.expenses)*100/(rm.lodging_revenue+sm.sales_revenue) else 0 end,
      'adr',case when rm.sold_room_nights>0 then rm.lodging_revenue/rm.sold_room_nights else 0 end,
      'revpar',case when rs.room_count*p.days_count>0 then rm.lodging_revenue/(rs.room_count*p.days_count) else 0 end,
      'cancellations',rm.cancellations,'noShows',rm.no_shows,'averageStay',rm.avg_stay,
      'averageRating',fm.average_rating,'feedbackCount',fm.feedback_count,
      'openComplaints',cm.open_complaints,'clientCount',clm.client_count
    ),
    'financialSeries',fs.rows,'channelRows',ch.rows,'roomTypeRows',rt.rows,
    'expenseRows',ex.rows,'originRows',og.rows,'complaintRows',cp.rows
  ) into result
  from params p, room_stats rs, reservation_metrics rm, sales_metrics sm, expense_metrics em,
       occupancy_now onow, feedback_metrics fm, complaint_metrics cm, clients_metrics clm,
       financial_series fs, channel_series ch, room_type_series rt, expense_series ex,
       origin_series og, complaint_series cp;

  return result;
end;
$$;

revoke all on function public.dashboard_strategic_aggregates(uuid,date,date) from public, anon;
grant execute on function public.dashboard_strategic_aggregates(uuid,date,date) to authenticated;
