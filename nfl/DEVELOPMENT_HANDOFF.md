# DEVELOPMENT_HANDOFF

## Estado atual
NFL Alpha funcional em HTML/CSS/JS sem build step.

## Funcionalidades concluídas
- Core de navegação e persistência
- 32 franquias
- sincronizador/importador de roster 2026
- PlayerAvatar/headshot resolver com fallback
- 50 atributos 1–200 e overall posicional
- perfis de atletas
- College Explorer
- 60 Super Bowls
- partida 2D inicial 11 x 11
- carreira, trades, lesões e rivalidades em versão inicial

## Arquivos principais
- index.html
- styles.css
- src/app.js
- src/dataService.js
- src/ratings.js
- src/nflEngine.js
- data/teams.json
- data/champions.json
- data/attributes.json

## Fotos
O aplicativo prioriza `headshot_url` do roster. Se ausente, tenta ESPN ID. Se ainda ausente, usa silhueta local. Não regredir fotos válidas para iniciais.

## Motor 2D
Funcional como protótipo: 22 entidades, formações iniciais, animação procedural simples e resolução de corrida/passe/passe profundo. Ainda não há bloqueios individuais, coverage assignments, sacks, special teams, relógio real ou playbook completo.

## Save
Persistência em localStorage. O roster sincronizado também é armazenado em cache local.

## Testes executados na geração
- contagem exata de 50 atributos
- validação JSON dos datasets
- verificação sintática dos módulos JS via Node quando disponível
- inspeção de estrutura do ZIP

## Pendências prioritárias
1. depth chart real
2. contratos e salary cap
3. rookies/draft/college prospects
4. schedule e standings
5. playbook e assignments
6. estatísticas por jogo/temporada/carreira
7. coaches/staff
8. engine 2D avançado
