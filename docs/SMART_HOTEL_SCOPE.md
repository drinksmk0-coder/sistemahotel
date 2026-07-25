# Escopo redefinido — SmartHotel OS

## Princípio do produto

O sistema deve funcionar como PMS operacional e centro de decisão do proprietário. Cada tela
precisa responder uma pergunta clara, sem misturar operação diária com análise gerencial.

## Arquitetura da experiência

### Operação sem gráficos

- Painel: caixa, pendências, entradas, saídas e ações do dia.
- Mapa: linha do tempo de UHs, disponibilidade, overbooking e criação de reserva.
- Reservas: lista, filtros, cadastro individual e em grupo.
- Quartos: status, limpeza, manutenção e problemas abertos.
- Clientes: cadastro, histórico, cobrança e comunicação.
- Produtos, vendas, despesas, equipe, café e limpeza: execução e conferência em tabelas/listas.

### BI somente onde gera decisão

- Financeiro: receita, despesas, lucro, recebimentos, vencidos, canais e dependência de OTA.
- Dashboard Estratégico: KPIs hoteleiros, evolução temporal, comparação com período e ano
  anterior, perfis de hóspedes, canais, UHs, previsão e recomendações.

## Personalização

- Tema global calculado a partir da cor principal.
- Logo, cor principal, destaque, fundo, superfície, texto e paleta dos gráficos.
- Estilo do fundo, transparência de cards e gráficos, efeito vidro, sombras, arredondamento e
  escala geral.
- Financeiro e Estratégico permitem mover, redimensionar, ocultar, trocar título, tipo, cor,
  fundo e opacidade de cada widget.
- Telas operacionais seguem o tema, mas mantêm estrutura protegida para não comprometer tarefas,
  cadastros ou check-in.

## Mapa de reservas

- UHs nas linhas e datas nas colunas.
- Reservas contínuas com identificação visual de quitada, sinal, pendente, vencida e finalizada.
- Quantidade de quartos livres por dia.
- Navegação de 7, 14 ou 21 dias.
- Clique em espaço vazio cria reserva; clique na faixa abre a UH.
- Cabeçalho e coluna das UHs permanecem visíveis durante a rolagem.

## Dados e indicadores

- Fonte única no PostgreSQL/Supabase.
- Regras de cálculo centralizadas para ADR, ocupação, RevPAR, TRevPAR e GOPPAR.
- Toda métrica deve informar período, fórmula, comparação e tratamento de divisão por zero.
- Gráficos limitam categorias e agrupam excedentes para impedir legendas ou rótulos sobrepostos.

## Integrações

- WhatsApp Business: templates, cobranças e pós-estadia.
- Booking/OTAs: disponibilidade, tarifa e reservas por API oficial/channel manager.
- Futuro: Google Business Profile, Instagram, Meta Ads, NFS-e e motor de reservas.
- Credenciais nunca ficam expostas no frontend; integrações passam por funções seguras.

## Ordem de evolução

1. Estabilidade visual e operacional.
2. Mapa de reservas e prevenção de overbooking.
3. Financeiro e KPIs confiáveis.
4. Integrações de WhatsApp e canais.
5. Copiloto com alertas, previsão e recomendações explicáveis.
