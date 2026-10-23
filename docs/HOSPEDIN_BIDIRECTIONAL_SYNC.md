# Hospedin ↔ Sistema Hotel: plano de sincronização bidirecional

## Objetivo

Sincronizar os dados entre o PMS Hospedin e o Sistema Hotel nos dois sentidos, usando exclusivamente recursos, campos e operações que a API oficial efetivamente disponibilizar e que as credenciais autorizarem.

## Fluxo pretendido

- Hospedin → Sistema Hotel: consultar alterações remotas e inserir/atualizar registros locais.
- Sistema Hotel → Hospedin: detectar alterações locais e criar/atualizar registros remotos, apenas quando a API permitir.
- Registrar execuções, resultados, erros e tentativas para diagnóstico e recuperação.
- Usar o identificador externo da Hospedin como chave de correspondência; não deduplicar apenas por nome ou data.
- Aplicar idempotência para que reprocessar a mesma alteração não crie reservas duplicadas.
- Tratar conflitos explicitamente: não sobrescrever silenciosamente uma versão mais recente; guardar a origem, os horários de atualização e o resultado do conflito.
- Respeitar paginação, limites de requisição, permissões, validações e regras de negócio da API.

## Modos de operação e segurança

1. **Configurar credenciais**: Client ID e Client Secret armazenados criptografados no servidor.
2. **Validar autenticação**: implementar o fluxo de token exatamente como a documentação oficial especificar.
3. **Leitura inicial**: testar consulta e mapear campos sem enviar alterações ao PMS.
4. **Simulação**: mostrar quais mudanças seriam enviadas, sem gravá-las remotamente.
5. **Escrita controlada**: habilitar criação/atualização somente para endpoints confirmados e após testes.
6. **Operação contínua**: usar webhooks quando oficialmente disponíveis; caso contrário, usar polling incremental apenas se houver endpoint/campo de atualização compatível.

## Contrato da API ainda necessário

Antes de ativar chamadas reais, confirmar com a documentação oficial ou OpenAPI/Swagger:
- URL base, autenticação/token, escopos e renovação;
- recursos/endpoints de reservas, hóspedes, quartos, tarifas e disponibilidade;
- campos obrigatórios e formatos de datas/valores;
- métodos de criação e atualização permitidos por recurso;
- identificadores estáveis, paginação, filtros incrementais e webhooks;
- limites, códigos de erro, idempotência e política de exclusão/cancelamento.

## Limite atual

Este documento não afirma que todos os recursos acima existem na API. A interface de credenciais e o armazenamento protegido são preparação. Até validar o contrato oficial, a sincronização bidirecional permanece desativada; não são realizadas gravações no PMS.
