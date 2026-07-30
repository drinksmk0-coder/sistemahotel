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
  reservation_history as (
    select coalesce(cliente_id::text, nullif(lower(trim(cliente_nome)), '')) as guest_key,
           count(*)::numeric as total_stays
    from public.reservations
    where company_id = p_company_id
      and status not in ('cancelado','manutencao')
      and coalesce(cliente_id::text, nullif(lower(trim(cliente_nome)), '')) is not null
    group by 1
  ),
  reservations_period as (
    select r.*,
           coalesce(nullif(trim(r.canal),''), 'Direto') as channel,
           coalesce(cliente_id::text, nullif(lower(trim(cliente_nome)), '')) as guest_key,
           (coalesce(r.presence_status,'') = 'no_show') as is_no_show
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
      coalesce(avg(greatest(1, checkout - checkin)) filter (where status not in ('cancelado','manutencao')),0)::numeric as avg_stay,
      count(*) filter (where status not in ('cancelado','manutencao'))::numeric as reservation_count
    from reservations_period, params p
  ),
  guest_period as (
    select distinct guest_key from valid_reservations where guest_key is not null
  ),
  guest_metrics as (
    select
      count(*)::numeric as guest_count,
      count(*) filter (where coalesce(h.total_stays,0) > 1)::numeric as recurring_guests,
      count(*) filter (where coalesce(h.total_stays,0) <= 1)::numeric as new_guests
    from guest_period g
    left join reservation_history h using (guest_key)
  ),
  guest_revenue_metrics as (
    select
      coalesce(sum(coalesce(r.valor_pago,0)) filter (where coalesce(h.total_stays,0) > 1),0)::numeric as recurring_revenue,
      coalesce(sum(coalesce(r.valor_pago,0)) filter (where coalesce(h.total_stays,0) <= 1),0)::numeric as new_revenue
    from valid_reservations r
    left join reservation_history h using (guest_key)
  ),
  sales_period as (
    select s.*
    from public.sales s, params p
    where s.company_id = p_company_id and s.data between p.start_date and p.end_date
  ),
  sales_metrics as (
    select coalesce(sum(coalesce(total,0)),0)::numeric as sales_revenue,
           count(*)::numeric as sales_lines,
           count(distinct coalesce(reserva_id::text, id::text))::numeric as sales_tickets
    from sales_period
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
  reservation_daily as (
    select checkin::date as day, sum(coalesce(valor_pago,0))::numeric as revenue
    from valid_reservations group by 1
  ),
  sales_daily as (
    select data::date as day, sum(coalesce(total,0))::numeric as revenue
    from sales_period group by 1
  ),
  expense_daily as (
    select data::date as day, sum(coalesce(valor,0))::numeric as expenses
    from public.expenses e, params p
    where e.company_id=p_company_id and e.data between p.start_date and p.end_date group by 1
  ),
  financial_days as (
    select d::date as day,
           coalesce(rd.revenue,0) + coalesce(sd.revenue,0) as revenue,
           coalesce(ed.expenses,0) as expenses
    from params p
    cross join generate_series(p.start_date, p.end_date, interval '1 day') d
    left join reservation_daily rd on rd.day=d::date
    left join sales_daily sd on sd.day=d::date
    left join expense_daily ed on ed.day=d::date
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
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value,'share',case when total>0 then value*100/total else 0 end) order by value desc),'[]'::jsonb) as rows
    from (
      select name, value, sum(value) over ()::numeric as total
      from (
        select coalesce(nullif(categoria,''),'Sem categoria') as name, sum(coalesce(valor,0))::numeric as value
        from public.expenses e, params p
        where e.company_id=p_company_id and e.data between p.start_date and p.end_date group by 1
      ) x
    ) q
  ),
  product_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'quantity',quantity,'revenue',revenue,'averagePrice',average_price,'share',case when total>0 then revenue*100/total else 0 end) order by revenue desc),'[]'::jsonb) as rows
    from (
      select name, quantity, revenue, average_price, sum(revenue) over ()::numeric as total
      from (
        select coalesce(nullif(trim(item),''),nullif(trim(categoria),''),'Sem identificação') as name,
               sum(coalesce(qtd,0))::numeric as quantity,
               sum(coalesce(total,0))::numeric as revenue,
               coalesce(avg(nullif(valor_unit,0)),0)::numeric as average_price
        from sales_period group by 1
      ) x
    ) q
  ),
  product_category_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value,'share',case when total>0 then value*100/total else 0 end) order by value desc),'[]'::jsonb) as rows
    from (
      select name, value, sum(value) over ()::numeric as total
      from (
        select coalesce(nullif(trim(categoria),''),'Sem categoria') as name, sum(coalesce(total,0))::numeric as value
        from sales_period group by 1
      ) x
    ) q
  ),
  payment_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value,'share',case when total>0 then value*100/total else 0 end) order by value desc),'[]'::jsonb) as rows
    from (
      select name, value, sum(value) over ()::numeric as total
      from (
        select name, sum(value)::numeric as value
        from (
          select coalesce(nullif(trim(pagamento),''),'Não informado') as name, coalesce(valor_pago,0)::numeric as value from valid_reservations
          union all
          select coalesce(nullif(trim(pagamento),''),'Não informado') as name, coalesce(total,0)::numeric as value from sales_period
        ) p group by name
      ) x
    ) q
  ),
  revenue_mix_series as (
    select jsonb_build_array(
      jsonb_build_object('name','Hospedagem','value',rm.lodging_revenue),
      jsonb_build_object('name','Produtos e serviços','value',sm.sales_revenue)
    ) as rows
    from reservation_metrics rm, sales_metrics sm
  ),
  state_series as (
    select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'value',value,'revenue',revenue) order by revenue desc),'[]'::jsonb) as rows
    from (
      select
        case
          when length(trim(c.estado))=2 then upper(trim(c.estado))
          when lower(trim(c.estado))='minas gerais' then 'MG'
          when lower(trim(c.estado))='são paulo' then 'SP'
          when lower(trim(c.estado))='rio de janeiro' then 'RJ'
          when lower(trim(c.estado))='espírito santo' then 'ES'
          when lower(trim(c.estado))='bahia' then 'BA'
          when lower(trim(c.estado))='paraná' then 'PR'
          when lower(trim(c.estado))='santa catarina' then 'SC'
          when lower(trim(c.estado))='rio grande do sul' then 'RS'
          when lower(trim(c.estado))='goiás' then 'GO'
          when lower(trim(c.estado))='distrito federal' then 'DF'
          when lower(trim(c.estado))='mato grosso' then 'MT'
          when lower(trim(c.estado))='mato grosso do sul' then 'MS'
          when lower(trim(c.estado))='acre' then 'AC'
          when lower(trim(c.estado))='alagoas' then 'AL'
          when lower(trim(c.estado))='amapá' then 'AP'
          when lower(trim(c.estado))='amazonas' then 'AM'
          when lower(trim(c.estado))='ceará' then 'CE'
          when lower(trim(c.estado))='maranhão' then 'MA'
          when lower(trim(c.estado))='pará' then 'PA'
          when lower(trim(c.estado))='paraíba' then 'PB'
          when lower(trim(c.estado))='pernambuco' then 'PE'
          when lower(trim(c.estado))='piauí' then 'PI'
          when lower(trim(c.estado))='rio grande do norte' then 'RN'
          when lower(trim(c.estado))='rondônia' then 'RO'
          when lower(trim(c.estado))='roraima' then 'RR'
          when lower(trim(c.estado))='sergipe' then 'SE'
          when lower(trim(c.estado))='tocantins' then 'TO'
          else upper(left(trim(c.estado),2))
        end as code,
        coalesce(nullif(trim(c.estado),''),'Não informado') as name,
        count(distinct r.guest_key)::numeric as value,
        sum(coalesce(r.valor_pago,0))::numeric as revenue
      from valid_reservations r
      join public.clients c on c.id=r.cliente_id and c.company_id=p_company_id
      where nullif(trim(c.estado),'') is not null
      group by 1,2
    ) q
  ),
  origin_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value,'revenue',revenue) order by revenue desc),'[]'::jsonb) as rows
    from (
      select coalesce(nullif(trim(c.cidade),''),nullif(trim(c.pais),''),'Não informada') as name,
             count(distinct r.guest_key)::numeric as value,
             sum(coalesce(r.valor_pago,0))::numeric as revenue
      from valid_reservations r
      join public.clients c on c.id=r.cliente_id and c.company_id=p_company_id
      group by 1 order by 3 desc limit 12
    ) q
  ),
  age_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value,'revenue',revenue) order by sort_order),'[]'::jsonb) as rows
    from (
      select
        case
          when age_years < 25 then 'Até 24'
          when age_years < 35 then '25–34'
          when age_years < 45 then '35–44'
          when age_years < 55 then '45–54'
          when age_years < 65 then '55–64'
          else '65+'
        end as name,
        case when age_years < 25 then 1 when age_years < 35 then 2 when age_years < 45 then 3 when age_years < 55 then 4 when age_years < 65 then 5 else 6 end as sort_order,
        count(distinct guest_key)::numeric as value,
        sum(revenue)::numeric as revenue
      from (
        select r.guest_key, extract(year from age(p_end,c.data_nascimento))::int as age_years, sum(coalesce(r.valor_pago,0))::numeric as revenue
        from valid_reservations r
        join public.clients c on c.id=r.cliente_id and c.company_id=p_company_id
        where c.data_nascimento is not null
        group by r.guest_key,c.data_nascimento
      ) a group by 1,2
    ) q
  ),
  reason_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value,'revenue',revenue) order by value desc),'[]'::jsonb) as rows
    from (
      select coalesce(nullif(trim(motivo_estadia),''),'Não informado') as name,
             count(*)::numeric as value,
             sum(coalesce(valor_pago,0))::numeric as revenue
      from valid_reservations group by 1
    ) q
  ),
  complaint_series as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc),'[]'::jsonb) as rows
    from (
      select coalesce(nullif(categoria,''),'Outros') as name, count(*)::numeric as value
      from public.complaints c, params p
      where c.company_id=p_company_id and c.created_at::date between p.start_date and p.end_date
      group by 1 order by 2 desc limit 8
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
      'openComplaints',cm.open_complaints,'clientCount',clm.client_count,
      'guestCount',gm.guest_count,'recurringGuests',gm.recurring_guests,'newGuests',gm.new_guests,
      'retentionRate',case when gm.guest_count>0 then gm.recurring_guests*100/gm.guest_count else 0 end,
      'recurringRevenue',grm.recurring_revenue,'newGuestRevenue',grm.new_revenue,
      'averageGuestRevenue',case when gm.guest_count>0 then (rm.lodging_revenue+sm.sales_revenue)/gm.guest_count else 0 end,
      'productTicket',case when sm.sales_tickets>0 then sm.sales_revenue/sm.sales_tickets else 0 end,
      'reservationCount',rm.reservation_count
    ),
    'financialSeries',fs.rows,'channelRows',ch.rows,'roomTypeRows',rt.rows,
    'expenseRows',ex.rows,'productRows',ps.rows,'productCategoryRows',pcs.rows,
    'paymentRows',pay.rows,'revenueMixRows',mix.rows,'stateRows',st.rows,
    'originRows',og.rows,'ageRows',ag.rows,'reasonRows',rsn.rows,'complaintRows',cp.rows
  ) into result
  from params p, room_stats rs, reservation_metrics rm, sales_metrics sm, expense_metrics em,
       occupancy_now onow, feedback_metrics fm, complaint_metrics cm, clients_metrics clm,
       guest_metrics gm, guest_revenue_metrics grm, financial_series fs, channel_series ch,
       room_type_series rt, expense_series ex, product_series ps, product_category_series pcs,
       payment_series pay, revenue_mix_series mix, state_series st, origin_series og,
       age_series ag, reason_series rsn, complaint_series cp;

  return result;
end;
$$;

revoke all on function public.dashboard_strategic_aggregates(uuid,date,date) from public, anon;
grant execute on function public.dashboard_strategic_aggregates(uuid,date,date) to authenticated;
