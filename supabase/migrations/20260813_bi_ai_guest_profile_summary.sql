create or replace view public.bi_ai_guest_profile_summary as
select
  company_id,
  coalesce(perfil_familiar,'Não informado') as perfil_familiar,
  coalesce(motivo_estadia,'Não informado') as motivo_estadia,
  coalesce(canal,'Não informado') as canal,
  coalesce(tipo_quarto,'Não informado') as tipo_quarto,
  coalesce(faixa_diaria,'Não informado') as faixa_diaria,
  round(avg(coalesce(quantidade_filhos,0))::numeric,2) as filhos_medio,
  sum(reservas)::bigint as reservas,
  sum(hospedes)::bigint as hospedes,
  sum(diarias)::bigint as diarias,
  round(sum(receita_bruta)::numeric,2) as receita_bruta,
  round(case when sum(diarias)>0 then sum(receita_bruta)/sum(diarias) else 0 end::numeric,2) as adr_ponderado,
  round(case when sum(reservas)>0 then sum(reservas*taxa_cancelamento)/sum(reservas) else 0 end::numeric,2) as taxa_cancelamento,
  round(case when sum(reservas)>0 then sum(reservas*taxa_no_show)/sum(reservas) else 0 end::numeric,2) as taxa_no_show
from public.bi_dashboard_cruzamentos
group by company_id,perfil_familiar,motivo_estadia,canal,tipo_quarto,faixa_diaria;
