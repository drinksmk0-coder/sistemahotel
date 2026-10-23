# Radar regional de ocupação — clima, eventos e concorrência

## Objetivo
Página de inteligência de mercado baseada em fontes públicas, com Cruzília (MG) como origem e uma lista inicial de cidades em raio aproximado de até 1.000 km.

## Fontes
- Open-Meteo: temperatura, sensação térmica, precipitação, umidade, vento e previsão de chuva. Endpoint público sem chave para o uso gratuito sujeito aos termos da API; exibir atribuição.
- OpenStreetMap / Overpass API: hospedagens mapeadas em raio de 25 km da cidade selecionada. Cobertura comunitária pode estar incompleta.
- Eventos: atalhos de pesquisa pública por cidade. Nesta versão, os eventos não são importados de uma API estruturada nem confirmados automaticamente.

## Limites
- A ocupação real dos concorrentes geralmente não é pública. Não inferir nem fabricar essa informação; preços e disponibilidade online são indicadores indiretos.
- A lista de municípios é uma amostra regional inicial e as distâncias são aproximadas.
- Para investigar correlação, cruzar ocupação diária, diárias vendidas, ADR e cancelamentos do próprio hotel com clima, feriados e eventos confirmados. Correlação não prova causalidade.
- As APIs públicas podem ter limites de uso ou indisponibilidade temporária.

## Rota
/_authenticated/radar-regional — seção Inteligência, papel dono.
