# HospedaMais Booking Connector

## Objetivo
Capturar, com confirmação humana, os dados visíveis de uma reserva aberta em `admin.booking.com` e enviá-los para a Central de Entradas do HospedaMais. A extensão usa a sessão já autenticada do Chrome e nunca armazena a senha da Booking.

## Instalação no computador do hotel
1. Baixe esta pasta do repositório.
2. No Chrome, abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione a pasta `booking-chrome-extension`.

## Configuração
Na extensão, informe:
- endpoint: `https://SEU-PROJETO.supabase.co/functions/v1/booking-browser-ingest`
- token: o mesmo valor configurado no segredo `BOOKING_CONNECTOR_TOKEN`
- ID da empresa no HospedaMais

## Uso
1. Abra o link de uma reserva recebido por e-mail.
2. Faça login normalmente na Booking, quando necessário.
3. Abra a extensão.
4. Confira código, hóspede, datas, valor, hóspedes, acomodação e status.
5. Clique em **Enviar para conferência**.

O evento será gravado como `needs_review`. Nenhuma reserva será criada, cancelada ou excluída automaticamente.

## Supabase
Aplicar a migration:
`20260806032000_create_booking_browser_events.sql`

Publicar a Edge Function:
`booking-browser-ingest`

Configurar o segredo:
`BOOKING_CONNECTOR_TOKEN=<valor forte e aleatório>`
