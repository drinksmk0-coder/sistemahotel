-- Camada analítica do Hotel Real: modelo estrela sobre o banco operacional.
-- Não duplica dados operacionais; views security_invoker preservam as políticas das tabelas-base.

create or replace view public.bi_dim_data with (security_invoker = true) as
with datas as (
  select company_id, checkin as data from public.reservations where checkin is not null
  union select company_id, checkout as data from public.reservations where checkout is not null
  union select company_id, data from public.sales where data is not null
  union select company_id, data from public.expenses where data is not null
)
select distinct company_id,to_char(data,'YYYYMMDD')::int as date_id,data,
 extract(year from data)::int as ano,extract(quarter from data)::int as trimestre,extract(month from data)::int as mes,
 case extract(month from data)::int when 1 then 'Janeiro' when 2 then 'Fevereiro' when 3 then 'Março' when 4 then 'Abril' when 5 then 'Maio' when 6 then 'Junho' when 7 then 'Julho' when 8 then 'Agosto' when 9 then 'Setembro' when 10 then 'Outubro' when 11 then 'Novembro' else 'Dezembro' end as mes_nome,
 extract(week from data)::int as semana_ano,extract(day from data)::int as dia,extract(isodow from data)::int as dia_semana_num,
 case extract(isodow from data)::int when 1 then 'Segunda' when 2 then 'Terça' when 3 then 'Quarta' when 4 then 'Quinta' when 5 then 'Sexta' when 6 then 'Sábado' else 'Domingo' end as dia_semana
from datas;

create or replace view public.bi_dim_quarto with (security_invoker = true) as
select r.company_id,r.id as quarto_id,r.numero as quarto_numero,r.andar,r.configuracao as tipo_quarto,r.preco as preco_cadastro,r.banheiro,
 case when r.preco=80 then true else coalesce(not r.banheiro,false) end as sem_banheiro_regra_80,
 r.frigobar,r.tv_smart,r.vista,r.nivel_ruido,r.ventilacao,r.tamanho_banheiro,r.tamanho_quarto,r.proximo_garagem,r.acesso_escadas,r.prioridade_venda,
 case when r.preco<=80 then 'Até R$80' when r.preco<=120 then 'R$81–120' when r.preco<=160 then 'R$121–160' when r.preco<=220 then 'R$161–220' else 'Acima de R$220' end as faixa_preco_quarto
from public.rooms r;

create or replace view public.bi_dim_hospede with (security_invoker = true) as
select c.company_id,c.id as hospede_id,c.tipo as tipo_cliente,c.cidade,c.estado,coalesce(c.pais,'BR') as pais,c.sexo,c.estado_civil,c.tem_filhos,c.quantidade_filhos,c.visitas,
 (c.corporate_account_id is not null) as corporativo,
 case when c.data_nascimento is null then 'Não informado' when extract(year from age(current_date,c.data_nascimento))<25 then 'Até 24' when extract(year from age(current_date,c.data_nascimento))<35 then '25–34' when extract(year from age(current_date,c.data_nascimento))<45 then '35–44' when extract(year from age(current_date,c.data_nascimento))<60 then '45–59' else '60+' end as faixa_etaria
from public.clients c;

create or replace view public.bi_dim_canal with (security_invoker = true) as
select distinct company_id,coalesce(nullif(trim(canal),''),'Não informado') as canal from public.reservations;

create or replace view public.bi_dim_status with (security_invoker = true) as
select distinct company_id,status,
 case when status='cancelado' then 'Cancelamento' when status='finalizado' then 'Concluída' when status='ocupado' then 'Hospedado' when status='reservado' then 'Futura/confirmada' when status='saida_pendente' then 'Saída pendente' else initcap(replace(coalesce(status,'não informado'),'_',' ')) end as status_grupo
from public.reservations;

create or replace view public.bi_dim_pagamento with (security_invoker = true) as
select distinct company_id,metodo from (
 select company_id,coalesce(nullif(trim(pagamento),''),'Não informado') as metodo from public.reservations
 union select company_id,coalesce(nullif(trim(method),''),'Não informado') as metodo from public.guest_payments
) x;

create or replace view public.bi_fato_reservas with (security_invoker = true) as
select r.company_id,r.id as reserva_id,r.cliente_id as hospede_id,q.id as quarto_id,r.quarto as quarto_numero,
 to_char(r.checkin,'YYYYMMDD')::int as checkin_date_id,to_char(r.checkout,'YYYYMMDD')::int as checkout_date_id,to_char(coalesce(r.data_reserva,r.created_at::date,r.checkin),'YYYYMMDD')::int as reserva_date_id,
 r.checkin,r.checkout,coalesce(r.data_reserva,r.created_at::date) as data_reserva,
 greatest(1,coalesce(r.diarias,(r.checkout-r.checkin),1))::int as noites,greatest(1,coalesce(r.pessoas,1))::int as hospedes,
 greatest(0,(r.checkin-coalesce(r.data_reserva,r.created_at::date,r.checkin)))::int as antecedencia_dias,
 coalesce(r.valor_diaria,0)::numeric as valor_diaria,coalesce(r.valor_total,0)::numeric as valor_total,coalesce(r.valor_pago,0)::numeric as valor_pago,
 greatest(0,coalesce(r.valor_total,0)-coalesce(r.valor_pago,0))::numeric as saldo,
 case when coalesce(r.valor_total,0)>0 then round((coalesce(r.valor_pago,0)/r.valor_total)*100,2) else 0 end as percentual_pago,
 coalesce(nullif(trim(r.canal),''),'Não informado') as canal,coalesce(nullif(trim(r.pagamento),''),'Não informado') as pagamento,coalesce(nullif(trim(r.motivo_estadia),''),'Não informado') as motivo_estadia,
 r.status,r.presence_status,r.billing_responsibility,r.origem_importacao,
 case when r.status='cancelado' then 1 else 0 end as cancelado_flag,
 case when lower(coalesce(r.status,'')||' '||coalesce(r.presence_status,'')) ~ 'no.?show' then 1 else 0 end as no_show_flag,
 case when r.status not in ('cancelado','manutencao') then 1 else 0 end as reserva_valida_flag,
 case when coalesce(r.pessoas,1)=1 then 'Individual' when coalesce(r.pessoas,1)=2 then 'Casal provável' else 'Família/Grupo' end as perfil_hospede_provavel,
 case when coalesce(r.valor_diaria,0)<=80 then 'Até R$80' when r.valor_diaria<=120 then 'R$81–120' when r.valor_diaria<=160 then 'R$121–160' when r.valor_diaria<=220 then 'R$161–220' else 'Acima de R$220' end as faixa_diaria,
 q.configuracao as tipo_quarto,q.preco as preco_quarto_cadastro,q.banheiro,case when q.preco=80 then true else coalesce(not q.banheiro,false) end as sem_banheiro_regra_80,
 c.cidade,c.estado,coalesce(c.pais,'BR') as pais_hospede,(c.corporate_account_id is not null) as hospede_corporativo
from public.reservations r
left join public.rooms q on q.company_id=r.company_id and q.numero=r.quarto
left join public.clients c on c.company_id=r.company_id and c.id=r.cliente_id;

create or replace view public.bi_fato_pagamentos with (security_invoker = true) as
select company_id,id as pagamento_id,reservation_id as reserva_id,cliente_id as hospede_id,created_at::date as data,to_char(created_at::date,'YYYYMMDD')::int as date_id,amount as valor,coalesce(nullif(trim(method),''),'Não informado') as metodo,coalesce(nullif(trim(source),''),'Não informado') as fonte from public.guest_payments;

create or replace view public.bi_fato_vendas with (security_invoker = true) as
select company_id,id as venda_id,reserva_id,cliente_id as hospede_id,quarto as quarto_numero,data,to_char(data,'YYYYMMDD')::int as date_id,item,categoria,qtd,valor_unit,total,valor_pago,pagamento,status from public.sales;

create or replace view public.bi_fato_despesas with (security_invoker = true) as
select company_id,id as despesa_id,data,to_char(data,'YYYYMMDD')::int as date_id,categoria,descricao,valor,pagamento,fornecedor from public.expenses;

create or replace view public.bi_ml_features_cancelamento with (security_invoker = true) as
select f.company_id,f.reserva_id,f.cancelado_flag as target_cancelamento,1::int as quartos,f.hospedes as pessoas,f.noites as diarias,f.valor_total as total,f.antecedencia_dias as lead_days,f.noites as stay_days,
 extract(isodow from f.checkin)::int as check_in_dayofweek,extract(month from f.checkin)::int as check_in_month,f.valor_diaria,f.valor_pago,f.percentual_pago,f.canal,f.motivo_estadia as motivo_viagem,f.pais_hospede as booker_country,f.tipo_quarto as tipo_unidade,f.faixa_diaria,f.perfil_hospede_provavel,f.sem_banheiro_regra_80
from public.bi_fato_reservas f where f.status in ('finalizado','cancelado');

create or replace view public.bi_dashboard_cruzamentos with (security_invoker = true) as
select company_id,canal,quarto_numero,tipo_quarto,faixa_diaria,perfil_hospede_provavel,status,count(*) as reservas,sum(hospedes) as hospedes,sum(noites) as diarias,sum(valor_total) as receita_bruta,sum(valor_pago) as recebido,sum(saldo) as saldo,round(avg(valor_diaria),2) as adr,round(avg(antecedencia_dias),1) as antecedencia_media,round(100.0*sum(cancelado_flag)/nullif(count(*),0),2) as taxa_cancelamento,round(100.0*sum(no_show_flag)/nullif(count(*),0),2) as taxa_no_show
from public.bi_fato_reservas group by company_id,canal,quarto_numero,tipo_quarto,faixa_diaria,perfil_hospede_provavel,status;

grant select on public.bi_dim_data,public.bi_dim_quarto,public.bi_dim_hospede,public.bi_dim_canal,public.bi_dim_status,public.bi_dim_pagamento,public.bi_fato_reservas,public.bi_fato_pagamentos,public.bi_fato_vendas,public.bi_fato_despesas,public.bi_ml_features_cancelamento,public.bi_dashboard_cruzamentos to authenticated;
