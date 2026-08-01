# Separação operacional e financeira das reservas

A situação do quarto não deve ser inferida pelo saldo da hospedagem.

## Regras

- `ocupado`: hóspede ainda está no hotel e o quarto está ocupado.
- `saida_pendente`: saída prevista passou e a recepção precisa conferir; não é uma dívida financeira.
- `finalizado` ou `checkout_at` preenchido: hóspede saiu e o quarto está liberado operacionalmente.
- `billing_status`: acompanha somente pagamento (`paid`, `pending`, `overdue`).
- Saldo pendente continua no financeiro mesmo depois do checkout.

## Exportação e análise

A view `reservation_operational_financial_status` expõe separadamente:

- status da hospedagem;
- status da presença;
- status operacional do quarto;
- data prevista e data real de saída;
- responsável pelo pagamento;
- status financeiro;
- saldo pendente;
- dias em atraso.

Isso impede que uma dívida antiga seja contada como hóspede presente ou quarto ocupado.