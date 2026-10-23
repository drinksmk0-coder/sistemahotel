# Hospedin → Sistema Hotel: importação somente leitura

## Objetivo
Importar dados disponibilizados pela API Hospedin para consulta no Sistema Hotel. Nesta fase, a Hospedin é a fonte de verdade: o Sistema Hotel pode ler dados remotos e gravar a cópia local, mas nunca enviar alterações ao PMS.

## Escopo inicial
- Consultar reservas e os campos que a API disponibilizar para leitura.
- Importar/atualizar cópias locais sem duplicar registros, usando o ID estável da Hospedin como chave externa.
- Quando disponível, consultar hóspedes, quartos, tarifas e disponibilidade em modo somente leitura.
- Exibir data/hora da última sincronização, quantidade importada e erros sem expor credenciais.
- Registrar execução e erros para diagnóstico.
- Respeitar paginação, limites, permissões e regras da API.

## Proteções obrigatórias
- Nenhuma chamada POST/PUT/PATCH/DELETE à API Hospedin para criar, editar ou cancelar dados.
- Não executar operações de escrita no PMS nem configurar webhooks que enviem alterações do Sistema Hotel à Hospedin.
- Validar autenticação e fazer primeiro uma consulta de teste sem gravar reservas.
- Fazer upsert local com chave única composta pela empresa e pelo ID externo da reserva; não deduplicar somente por nome ou data.
- A importação local não deve apagar reservas locais existentes. Conflitos devem ser sinalizados e tratados explicitamente.
- Segredos ficam apenas no servidor e nunca em logs, navegador, mensagens ou GitHub.

## Fluxo de implementação
1. Guardar as credenciais no servidor.
2. Confirmar o método de autenticação oficial e validar token.
3. Executar uma consulta de leitura pequena e registrar a resposta sanitizada.
4. Mapear campos da Hospedin para o modelo local do Sistema Hotel.
5. Implementar importação idempotente em tabela/campos locais, preservando a origem externa.
6. Mostrar os dados importados e o estado da última execução.
7. Agendar consultas periódicas apenas se a API permitir e os limites forem conhecidos.

## Informações técnicas ainda necessárias
As credenciais Client ID e Client Secret não revelam o contrato da API. Para fazer chamadas reais, ainda é necessário confirmar a URL base, autenticação/token, endpoint de listagem de reservas, campos, paginação/filtros, IDs estáveis e limites. Não inventar URLs ou formato de token.

## Estado atual
O formulário de credenciais e a função de armazenamento protegido são preparação. A importação real ainda não está ativa, pois o contrato técnico da API não foi confirmado e o ambiente Supabase precisa estar configurado/deployado. Esta integração deve permanecer somente leitura; a sincronização de escrita está fora do escopo.
