select
  status_hospedagem,
  status_operacional_quarto,
  status_presenca,
  status_financeiro,
  count(*) as quantidade,
  sum(saldo_pendente) as saldo
from public.reservation_operational_financial_status
group by 1, 2, 3, 4
order by 1, 4;