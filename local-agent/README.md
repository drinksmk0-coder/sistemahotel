# HospedaMais Local Agent

Serviço local para tarefas que dependem da sessão autenticada do PC do hotel. O primeiro módulo monitora a Extranet da Booking e envia reservas/cancelamentos para o mesmo endpoint seguro usado pela extensão.

## Princípios
- não armazena senha da Booking;
- usa perfil persistente do Chromium para manter a sessão;
- se houver login, 2FA ou CAPTCHA, para e aguarda ação humana;
- não exclui reservas, hóspedes, pagamentos ou histórico;
- envia somente eventos com código Booking e dados mínimos seguros;
- backend do HospedaMais continua responsável por deduplicação, quarto, conflito e cancelamento.

## Instalação no Windows
1. Instale Node.js LTS.
2. Abra PowerShell na pasta `local-agent`.
3. Execute `powershell -ExecutionPolicy Bypass -File .\install-windows.ps1`.
4. Edite `.env` e preencha `BOOKING_CONNECTOR_ENDPOINT`, `BOOKING_CONNECTOR_TOKEN` e `COMPANY_ID`.
5. Rode `npm start` na primeira vez e faça login manual na Booking se solicitado.

O instalador registra uma tarefa do Windows para iniciar o agente no logon.

## Booking
O agente abre a tela de reservas configurada, encontra links com `res_id`, visita as reservas, extrai os mesmos campos da extensão e envia somente quando houver segurança mínima. O intervalo padrão é 5 minutos.

## Gmail
O módulo Gmail deve usar a API oficial do Google/OAuth, não automação visual do navegador. Ele poderá classificar e encaminhar ao HospedaMais e-mails de despesas, fornecedores, Booking e documentos. As credenciais OAuth ainda precisam ser configuradas para ativar esse módulo.

## Mensagens
WhatsApp, Instagram e Messenger devem ficar no backend via APIs oficiais da Meta para funcionar 24/7 mesmo com o PC desligado. Booking Messages pode ganhar um módulo local separado, mas respostas automáticas devem ter limites: dúvidas gerais podem ser respondidas; pagamento, cancelamento, reclamação, emergência e alterações de reserva exigem handoff humano.

## Reserva por WhatsApp
O fluxo recomendado é servidor-side: coletar nome, datas, quantidade de hóspedes e preferência; consultar disponibilidade real; apresentar opções; exigir confirmação explícita; então criar a reserva com idempotência e registrar o histórico. A IA nunca escolhe um quarto ocupado nem altera pagamento automaticamente.
