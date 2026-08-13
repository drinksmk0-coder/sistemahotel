# Guia de produto — análise de dados e automação hoteleira

Este documento orienta a evolução do sistema como PMS + camada analítica, evitando telas, métricas e automações isoladas.

## 1. Princípio central

Toda funcionalidade deve pertencer à jornada do hóspede ou à gestão do hotel e alimentar uma única fonte de verdade. O fluxo desejado é:

Reserva → pré-check-in/FNRH → check-in → hospedagem/quarto → consumo/serviços → governança/manutenção → checkout → feedback → fidelização.

As áreas operacionais (reservas, financeiro, vendas, governança, avaliações, reclamações) continuam independentes para operação, mas convergem no modelo estrela e nas views de BI.

## 2. Indicadores principais

### Quantitativos executivos
- Ocupação
- ADR
- RevPAR
- Room nights
- Receita total
- GOP / GOPPAR
- Taxa de cancelamento e no-show
- Receita adicional e ticket médio de extras
- Canal de venda e conversão direta quando houver base confiável

### Qualitativos
- Satisfação média (CSAT operacional, conforme escala disponível)
- Taxa de recomendação
- Avaliações com atenção
- Problemas recorrentes por quarto/categoria
- Limpeza, atendimento, conforto e custo-benefício

Não chamar taxa binária de recomendação de NPS. NPS só deve existir se a pesquisa coletar nota 0–10 da pergunta de recomendação.

## 3. Perguntas que cada dashboard deve responder

1. Demanda: estamos enchendo ou esvaziando e o que a previsão indica?
2. Preço: ADR está adequado à ocupação e ao tipo de quarto?
3. Rentabilidade: receita está virando GOP/GOPPAR?
4. Canal: qual canal traz receita com menor cancelamento e melhor ADR?
5. Público: quem compra qual quarto, por qual motivo, com ou sem filhos e em qual faixa de preço?
6. Experiência: hóspedes estão satisfeitos, recomendam e quais problemas derrubam a nota?
7. Receita adicional: quanto cada hóspede/reserva consome além da diária e quais categorias aumentam ticket?
8. Ação: qual decisão o gestor deve tomar agora?

## 4. Automação como jornada

Priorizar integrações e automações que eliminem digitação duplicada e conectem etapas:
- leitura/cadastro de FNRH e check-in;
- check-in/check-out online ou assistido;
- atualização de status do quarto e governança mobile;
- consumo/PDV/comanda ligado à reserva/quarto;
- mensagens e solicitações ligadas ao hóspede/reserva;
- baixa financeira integrada;
- envio automático de pesquisa pós-checkout;
- alertas de reclamação e manutenção;
- previsão de ocupação/cancelamento e recomendação prescritiva.

## 5. Modelo de dados

Operacional → modelo estrela/views BI → features ML → previsão → prescrição → dashboard/HotelAI.

Dimensões principais: data, hóspede, quarto, canal, status, pagamento, perfil familiar, motivo da viagem e categoria de consumo.

Fatos principais: reserva, estadia-dia, pagamento, venda/consumo, despesa, feedback e reclamação.

## 6. Regra de design

Menos gráficos e mais perguntas de negócio. Um gráfico só permanece se explicar um KPI, revelar causa/segmento ou apoiar uma ação. Evitar gráficos que apenas repetem um número já mostrado em card.

## 7. Próximas evoluções recomendadas

- ligar consumo/PDV à reserva sempre que possível;
- calcular ticket médio de extras por reserva e por perfil;
- cruzar satisfação com quarto, tarifa, canal e motivo da viagem;
- criar pesquisa de recomendação 0–10 caso se deseje NPS real;
- criar fluxo governança mobile com checklist e tempo de liberação do quarto;
- medir tempo de check-in/check-out e ganho de automação;
- usar HotelAI para transformar desvios em plano de ação, sempre distinguindo dado, inferência e premissa.