create or replace function public.dashboard_storytelling_details(
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
  previous_start date;
  previous_end date;
  current_metrics jsonb;
  previous_metrics jsonb;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;
  if not public.is_company_member(p_company_id, auth.uid()) then
    raise exception 'Acesso negado à empresa';
  end if;
  if p_start is null or p_end is null or p_end < p_start or p_end-p_start > 730 then
    raise exception 'Período inválido';
  end if;

  if p_start=p_end then
    previous_start := p_start-1;
  elsif p_start=date_trunc('month',p_start)::date
    and p_end=(date_trunc('month',p_start)+interval '1 month - 1 day')::date then
    previous_start := (p_start-interval '1 month')::date;
  elsif p_start=make_date(extract(year from p_start)::int,1,1)
    and p_end=make_date(extract(year from p_start)::int,12,31) then
    previous_start := make_date(extract(year from p_start)::int-1,1,1);
  else
    previous_start := p_start-(p_end-p_start+1);
  end if;
  previous_end := p_start-1;

  current_metrics := public.dashboard_story_period_metrics(p_company_id,p_start,p_end);
  previous_metrics := public.dashboard_story_period_metrics(p_company_id,previous_start,previous_end);

  with
  current_reservations as (
    select r.*,
      greatest(0,least(r.checkout,p_end+1)-greatest(r.checkin,p_start))::numeric as nights_in_range
    from public.reservations r
    where r.company_id=p_company_id
      and r.checkin<=p_end and r.checkout>=p_start
      and coalesce(r.status,'')<>'manutencao'
  ),
  current_sales as (
    select s.*,
      case when lower(coalesce(s.categoria,'')||' '||coalesce(s.item,'')) ~ '(lavander|lavagem|camareira|servi[cç]o|late.?check|early.?check|estacionamento|transfer|passeio)'
        then 'Serviços' else 'Produtos' end as revenue_kind
    from public.sales s
    where s.company_id=p_company_id and s.data between p_start and p_end
  ),
  reservation_daily as (
    select checkin::date as day,
      coalesce(sum(coalesce(valor_pago,0)) filter(where status<>'cancelado'),0)::numeric as lodging_revenue,
      count(*) filter(where status<>'cancelado')::numeric as reservation_count,
      coalesce(sum(greatest(coalesce(pessoas,1),1)) filter(where status<>'cancelado'),0)::numeric as guests
    from current_reservations
    where checkin between p_start and p_end
    group by 1
  ),
  sales_daily as (
    select data::date as day,
      coalesce(sum(coalesce(total,0)) filter(where revenue_kind='Produtos'),0)::numeric as product_revenue,
      coalesce(sum(coalesce(total,0)) filter(where revenue_kind='Serviços'),0)::numeric as service_revenue
    from current_sales group by 1
  ),
  expense_daily as (
    select data::date as day,coalesce(sum(coalesce(valor,0)),0)::numeric as expenses
    from public.expenses
    where company_id=p_company_id and data between p_start and p_end
    group by 1
  ),
  expense_ranked as (
    select data::date as day,coalesce(nullif(trim(categoria),''),'Sem categoria') as category,
      sum(coalesce(valor,0))::numeric as value,
      row_number() over(partition by data::date order by sum(coalesce(valor,0)) desc) as rn
    from public.expenses
    where company_id=p_company_id and data between p_start and p_end
    group by data::date,coalesce(nullif(trim(categoria),''),'Sem categoria')
  ),
  daily_rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'date',d.day,'label',to_char(d.day,'DD/MM'),
      'lodgingRevenue',coalesce(rd.lodging_revenue,0),
      'productRevenue',coalesce(sd.product_revenue,0),
      'serviceRevenue',coalesce(sd.service_revenue,0),
      'totalRevenue',coalesce(rd.lodging_revenue,0)+coalesce(sd.product_revenue,0)+coalesce(sd.service_revenue,0),
      'expenses',coalesce(ed.expenses,0),
      'gop',coalesce(rd.lodging_revenue,0)+coalesce(sd.product_revenue,0)+coalesce(sd.service_revenue,0)-coalesce(ed.expenses,0),
      'reservationCount',coalesce(rd.reservation_count,0),'guestCount',coalesce(rd.guests,0),
      'topExpenseCategory',coalesce(er.category,'Sem despesa'),'topExpenseValue',coalesce(er.value,0),
      'topRevenueSource',case
        when coalesce(rd.lodging_revenue,0)>=greatest(coalesce(sd.product_revenue,0),coalesce(sd.service_revenue,0)) then 'Hospedagem'
        when coalesce(sd.product_revenue,0)>=coalesce(sd.service_revenue,0) then 'Produtos'
        else 'Serviços' end
    ) order by d.day),'[]'::jsonb) as rows
    from (select generate_series(p_start,p_end,interval '1 day')::date as day) d
    left join reservation_daily rd on rd.day=d.day
    left join sales_daily sd on sd.day=d.day
    left join expense_daily ed on ed.day=d.day
    left join expense_ranked er on er.day=d.day and er.rn=1
  ),
  gender_rows as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value) order by value desc),'[]'::jsonb) as rows
    from (
      select case
        when lower(trim(coalesce(c.sexo,''))) in ('m','masculino','homem') then 'Homens'
        when lower(trim(coalesce(c.sexo,''))) in ('f','feminino','mulher') then 'Mulheres'
        when nullif(trim(coalesce(c.sexo,'')),'') is null then 'Não informado'
        else 'Outro' end as name,
        count(distinct c.id)::numeric as value
      from current_reservations r
      join public.clients c on c.id=r.cliente_id and c.company_id=p_company_id
      where r.status<>'cancelado'
      group by 1
    ) q
  ),
  children_rows as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'value',value) order by sort_order),'[]'::jsonb) as rows
    from (
      select case when c.tem_filhos is true then 'Com filhos' when c.tem_filhos is false then 'Sem filhos' else 'Não informado' end as name,
        case when c.tem_filhos is true then 1 when c.tem_filhos is false then 2 else 3 end as sort_order,
        count(distinct c.id)::numeric as value
      from current_reservations r
      join public.clients c on c.id=r.cliente_id and c.company_id=p_company_id
      where r.status<>'cancelado'
      group by 1,2
    ) q
  ),
  average_children as (
    select coalesce(avg(coalesce(c.quantidade_filhos,0)) filter(where c.tem_filhos is true),0)::numeric as value
    from current_reservations r
    join public.clients c on c.id=r.cliente_id and c.company_id=p_company_id
    where r.status<>'cancelado'
  ),
  room_performance as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'room',room,'roomType',room_type,'revenue',revenue,'soldNights',sold_nights,
      'reservations',reservations,'guests',guests,
      'adr',case when sold_nights>0 then revenue/sold_nights else 0 end,
      'occupancyRate',case when period_days>0 then sold_nights*100/period_days else 0 end
    ) order by revenue desc),'[]'::jsonb) as rows
    from (
      select r.quarto as room,coalesce(nullif(ro.configuracao,''),'Não informado') as room_type,
        sum(coalesce(r.valor_pago,0))::numeric as revenue,sum(r.nights_in_range)::numeric as sold_nights,
        count(*)::numeric as reservations,sum(greatest(coalesce(r.pessoas,1),1))::numeric as guests,
        greatest(1,p_end-p_start+1)::numeric as period_days
      from current_reservations r
      left join public.rooms ro on ro.company_id=p_company_id and ro.numero=r.quarto
      where r.status<>'cancelado'
      group by r.quarto,ro.configuracao
    ) q
  )
  select jsonb_build_object(
    'currentRange',jsonb_build_object('start',p_start,'end',p_end),
    'previousRange',jsonb_build_object('start',previous_start,'end',previous_end),
    'current',current_metrics,'previous',previous_metrics,
    'dailyRows',dr.rows,
    'revenueMixRows',jsonb_build_array(
      jsonb_build_object('name','Hospedagem','value',coalesce((current_metrics->>'lodgingRevenue')::numeric,0)),
      jsonb_build_object('name','Produtos','value',coalesce((current_metrics->>'productRevenue')::numeric,0)),
      jsonb_build_object('name','Serviços','value',coalesce((current_metrics->>'serviceRevenue')::numeric,0))
    ),
    'genderRows',gr.rows,'childrenRows',chr.rows,'averageChildren',ac.value,
    'roomPerformanceRows',rp.rows
  ) into result
  from daily_rows dr,gender_rows gr,children_rows chr,average_children ac,room_performance rp;

  return result;
end;
$$;

revoke all on function public.dashboard_storytelling_details(uuid,date,date) from public,anon;
grant execute on function public.dashboard_storytelling_details(uuid,date,date) to authenticated;
