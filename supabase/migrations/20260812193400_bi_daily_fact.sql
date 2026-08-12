-- Grão diário para ocupação e resultado: uma linha por reserva/quarto/noite.
create or replace view public.bi_fato_estadia_dia with (security_invoker = true) as
select f.company_id,f.reserva_id,f.hospede_id,f.quarto_id,f.quarto_numero,gs::date as data,to_char(gs::date,'YYYYMMDD')::int as date_id,
 f.canal,f.pagamento,f.motivo_estadia,f.perfil_hospede_provavel,f.faixa_diaria,f.tipo_quarto,f.hospedes,1::int as quarto_noite,
 f.valor_total/nullif(f.noites,0) as receita_hospedagem_dia,least(f.valor_pago,f.valor_total)/nullif(f.noites,0) as recebido_hospedagem_dia,
 f.status,f.cancelado_flag,f.no_show_flag,f.reserva_valida_flag
from public.bi_fato_reservas f
cross join lateral generate_series(f.checkin::timestamp,(f.checkout-1)::timestamp,interval '1 day') gs
where f.checkout>f.checkin;

create or replace view public.bi_dashboard_diario with (security_invoker = true) as
with stay as (
 select company_id,data,count(distinct quarto_numero) filter(where reserva_valida_flag=1 and no_show_flag=0) as quartos_ocupados,
 sum(quarto_noite) filter(where reserva_valida_flag=1 and no_show_flag=0) as diarias_ocupadas,
 sum(hospedes) filter(where reserva_valida_flag=1 and no_show_flag=0) as hospede_noites,
 sum(receita_hospedagem_dia) filter(where reserva_valida_flag=1 and no_show_flag=0) as receita_hospedagem,
 sum(recebido_hospedagem_dia) filter(where reserva_valida_flag=1 and no_show_flag=0) as recebido_hospedagem
 from public.bi_fato_estadia_dia group by company_id,data
), arrivals as (
 select company_id,checkin as data,count(*) filter(where status<>'manutencao') as reservas_checkin,count(*) filter(where status='cancelado') as cancelamentos,sum(no_show_flag) as no_shows
 from public.bi_fato_reservas group by company_id,checkin
), sale as (
 select company_id,data,sum(total) filter(where coalesce(status,'')<>'cancelado') as receita_extras,sum(valor_pago) filter(where coalesce(status,'')<>'cancelado') as recebido_extras
 from public.bi_fato_vendas group by company_id,data
), exp as (
 select company_id,data,sum(valor) as despesas from public.bi_fato_despesas group by company_id,data
), dates as (
 select company_id,data from stay union select company_id,data from arrivals union select company_id,data from sale union select company_id,data from exp
), room_count as (
 select company_id,count(*)::numeric as quartos_total from public.rooms group by company_id
)
select d.company_id,d.data,to_char(d.data,'YYYYMMDD')::int as date_id,coalesce(s.quartos_ocupados,0)::int as quartos_ocupados,coalesce(rc.quartos_total,0)::int as quartos_total,
 case when coalesce(rc.quartos_total,0)>0 then round(100.0*coalesce(s.quartos_ocupados,0)/rc.quartos_total,2) else 0 end as ocupacao_pct,
 coalesce(s.diarias_ocupadas,0)::int as diarias_ocupadas,coalesce(s.hospede_noites,0)::int as hospede_noites,coalesce(a.reservas_checkin,0)::int as reservas_checkin,
 coalesce(a.cancelamentos,0)::int as cancelamentos,coalesce(a.no_shows,0)::int as no_shows,coalesce(s.receita_hospedagem,0)::numeric as receita_hospedagem,
 coalesce(sa.receita_extras,0)::numeric as receita_extras,(coalesce(s.receita_hospedagem,0)+coalesce(sa.receita_extras,0))::numeric as receita_total,
 (coalesce(s.recebido_hospedagem,0)+coalesce(sa.recebido_extras,0))::numeric as recebido_total,coalesce(e.despesas,0)::numeric as despesas,
 (coalesce(s.receita_hospedagem,0)+coalesce(sa.receita_extras,0)-coalesce(e.despesas,0))::numeric as gop,
 case when coalesce(s.diarias_ocupadas,0)>0 then round(coalesce(s.receita_hospedagem,0)/s.diarias_ocupadas,2) else 0 end as adr,
 case when coalesce(rc.quartos_total,0)>0 then round(coalesce(s.receita_hospedagem,0)/rc.quartos_total,2) else 0 end as revpar
from dates d left join stay s using(company_id,data) left join arrivals a using(company_id,data) left join sale sa using(company_id,data) left join exp e using(company_id,data) left join room_count rc using(company_id);

grant select on public.bi_fato_estadia_dia,public.bi_dashboard_diario to authenticated;
