# DEVELOPMENT HANDOFF — NHL Universe 2D

## Estado atual
Alpha 0.1 funcional em frontend vanilla.

## Implementado
- Estrutura de 32 franquias.
- Logos.
- Arenas.
- Elencos NHL carregados via API.
- Fotos de jogadores via headshot.
- Prospectos por franquia.
- 35 atributos 0–100.
- Modelo separado para skaters e goalies.
- Histórico Stanley Cup 1927–2026.
- Rivalidades.
- Rink 2D protótipo.
- Modal de perfil de atleta.
- Busca e seleção de franquia.
- Cache em memória da sessão.

## Dados externos
- NHL Web API: api-web.nhle.com
- NHL assets: assets.nhle.com

## Limitações
- O app depende de internet para roster, prospects e imagens.
- Ratings são gerados pelo simulador, não scouting ratings oficiais.
- Rink 2D ainda é um protótipo, não um jogo completo.
- Contracts, salary cap, trades, injuries, coaches e career engine ainda não implementados.

## Próximos passos
1. Sincronizar stats reais e gerar ratings usando produção recente.
2. Lines/depth chart.
3. Staff e coaches.
4. Contract/salary cap.
5. Trade AI.
6. Injury engine.
7. Schedule/standings.
8. Career save.
9. 2D: skating physics.
10. Puck possession/pass/shot/goalie/check systems.

## v11 (American Sports Universe shell)
UI reescrita no shell comum (ver `../CLAUDE_HANDOFF.md`): `index.html` + `src/{app,nhlData,rink}.js` + `nhl.css`.
`js/data.js` continua sendo a base. `js/app.js` e `styles.css` da Alpha ficaram sem uso (referência).
