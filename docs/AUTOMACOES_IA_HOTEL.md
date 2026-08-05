# Automações com IA do HospedaMais

## Objetivo desta primeira versão

Conectar a recepção virtual já existente no HospedaMais aos canais externos sem permitir que uma IA exclua reservas, hóspedes, pagamentos ou histórico. Cancelamentos, alterações financeiras, troca de quarto, alteração de datas e confirmação definitiva de reserva exigem aprovação humana.

## Fluxos funcionais

1. **Captação e qualificação de leads**
   - Entrada: WhatsApp, Instagram/Facebook, formulário ou e-mail.
   - A IA coleta nome, telefone, datas, quantidade de hóspedes, motivo da viagem e preferência de quarto.
   - Resultado: lead qualificado com status `novo`, `qualificado`, `aguardando_cliente`, `convertido` ou `perdido`.

2. **Consulta de disponibilidade**
   - Consulta somente leitura em quartos e reservas da empresa atual.
   - Retorna opções de quarto e tarifa sem prometer disponibilidade até a recepção confirmar.

3. **Pré-reserva e reserva**
   - A IA monta a proposta e cria uma pré-reserva.
   - A recepção confirma os dados antes da criação definitiva da reserva.
   - Alterações posteriores também exigem confirmação humana.

4. **FNRH e pré-check-in**
   - Após confirmação, envia link seguro para preenchimento da FNRH.
   - Registra envio, abertura, preenchimento e pendência.

5. **Lembretes operacionais**
   - Antes do check-in: confirmação, horário de chegada e instruções.
   - No check-out: saldo, horário e devolução de chave.
   - Pós-estadia: agradecimento, avaliação e follow-up.

6. **Recuperação de reservas não concluídas**
   - Lead que pediu preço e não respondeu recebe follow-up com limite de frequência.
   - O fluxo para imediatamente quando o cliente responde, recusa ou solicita não receber mensagens.

7. **Atendimento humano**
   - Encaminhamento obrigatório para reclamação, ameaça, cobrança contestada, pedido fora das regras, cancelamento, mudança financeira e baixa confiança da IA.

## Booking por Gmail

O caminho inicial usa Gmail API ou n8n para ler apenas mensagens da Booking, classificar nova reserva, alteração ou cancelamento e gravar um evento em `booking_email_events`.

- Nova reserva e alteração: criar item de conferência, sem modificar dados críticos automaticamente.
- Cancelamento: nunca excluir. Registrar evento e solicitar confirmação humana, preservando histórico.
- Idempotência: cada e-mail precisa de `provider_message_id` único para não processar duas vezes.

## Google Calendar

Criar eventos operacionais para check-in, check-out, manutenção e compromissos. O calendário é complementar; reservas continuam tendo o Supabase como fonte principal.

## WhatsApp e n8n

Arquitetura recomendada:

`WhatsApp Business Cloud API -> n8n -> webhook autenticado do HospedaMais -> Gemini -> regras do hotel -> resposta`

O n8n deve enviar `x-hospedamais-signature`, `company_id`, `channel`, `external_message_id` e o conteúdo normalizado. O HospedaMais deve rejeitar mensagens sem assinatura válida e duplicadas.

## Controles obrigatórios

- isolamento por `company_id` em todas as consultas;
- RLS no Supabase;
- trilha de auditoria para ações da IA;
- idempotência por mensagem externa;
- limite de follow-up e opt-out;
- confirmação humana para ações críticas;
- segredos somente em variáveis de ambiente;
- nenhum token do Google, Meta ou Gemini exposto no navegador.

## Critérios de aceite

- build aprovado;
- preview Vercel em estado `READY`;
- teste de disponibilidade sem escrita;
- teste de pré-reserva sem confirmação definitiva;
- teste de deduplicação de mensagem;
- teste de cancelamento preservando histórico;
- teste de isolamento entre empresas;
- registro das credenciais externas ainda ausentes.
