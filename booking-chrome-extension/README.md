# HospedaMais Booking Connector

## Objetivo
Capturar reservas e cancelamentos visíveis em `admin.booking.com` e enviá-los ao HospedaMais. Quando a Booking disponibiliza o telefone, a extensão aciona **Mostrar telefone**, captura o número e o vincula ao hóspede para que a recepção possa enviar o check-in online/FNRH. A extensão usa a sessão já autenticada do Chrome e nunca armazena a senha da Booking.

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
4. Confira código, hóspede, telefone, datas, valor, hóspedes, acomodação e status.
5. Clique em **Enviar para conferência**.

Reservas com categoria mapeada e quarto livre são criadas automaticamente; cancelamentos confirmados atualizam o status sem excluir o histórico. Casos ambíguos permanecem em revisão manual.

## Supabase
Aplicar também as migrations de telefone e acesso privado da pasta `supabase/migrations`.

Publicar a Edge Function:
`booking-browser-ingest`

Configurar o segredo:
`BOOKING_CONNECTOR_TOKEN=<valor forte e aleatório>`
