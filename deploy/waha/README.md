# WAHA para o HospedaMais

Este pacote prepara o WAHA Core para execução 24 horas em uma VPS com EasyPanel ou Docker Compose.

## Requisitos

- VPS Linux com IP público
- mínimo recomendado: 2 vCPU e 2 GB de RAM
- domínio ou URL HTTPS fornecida pelo EasyPanel
- celular com o WhatsApp do hotel para escanear o QR Code

## EasyPanel

1. Instale o EasyPanel na VPS.
2. Crie um projeto `hospedamais`.
3. Crie um serviço App chamado `waha`.
4. Use a imagem `devlikeapro/waha`.
5. Crie dois volumes persistentes:
   - `sessions` em `/app/.sessions`
   - `media` em `/app/.media`
6. Cadastre as variáveis do `.env.example` como secrets no EasyPanel.
7. Desative Zero Downtime Deployment para evitar duas instâncias usando a mesma sessão.
8. Faça o deploy e abra a URL HTTPS.
9. Entre no painel com o usuário e senha configurados.
10. Informe a `WAHA_API_KEY`, crie a sessão `hotel-real` e escaneie o QR Code.

## Docker Compose

```bash
cd deploy/waha
cp .env.example .env
# edite o .env sem publicar os valores
docker compose up -d
```

O serviço escuta apenas em `127.0.0.1:3000`. Em produção, publique-o por proxy HTTPS do EasyPanel, Caddy ou Nginx.

## Segurança

- Não versionar o `.env` real.
- Não expor a porta 3000 diretamente à internet.
- Usar uma chave longa em `WAHA_API_KEY`.
- Manter os volumes de sessão e mídia persistentes e com backup.
- Configurar o webhook apenas para o endpoint seguro do HospedaMais.

## Integração pendente

Depois da VPS estar online, cadastrar no HospedaMais:

- URL pública do WAHA
- API Key
- nome da sessão `hotel-real`
- token do webhook do HospedaMais

O fluxo final será:

`WhatsApp → WAHA → webhook seguro do HospedaMais → MAIVK → WAHA → WhatsApp`.
