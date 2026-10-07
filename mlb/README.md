# MLB Universe 2D — Alpha 0.1

Base em HTML/CSS/JavaScript para um simulador/manager de MLB.

## Incluído
- 30 franquias MLB.
- Logos por franquia.
- Estádios 2026.
- Elencos 2026 via MLB StatsAPI.
- Fotos/headshots via MLB static image service.
- 40 atributos fixos (0–100).
- 30 atributos momentâneos/adaptativos (0–100).
- Prospect Explorer.
- Draft real por ano (2026 como padrão).
- Histórico da World Series 1903–2025.
- Rivalidades com Rivalry Score.
- Protótipo Diamond 2D.
- Perfis individuais dos jogadores.
- Sincronização de todos os rosters.

## Atributos adaptativos
Os 30 atributos adaptativos representam contexto variável:
forma, confiança, fadiga, timing do dia, matchups, pressão, prontidão, comando dos arremessos, momentum e risco de lesão.
O botão "Atualizar contexto do dia" recalcula esse bloco sem alterar os ratings-base.

## Ratings
Os 40 ratings fixos e os 30 ratings adaptativos são próprios do simulador.
Não são ratings oficiais da MLB, MLB The Show ou de terceiros.

## Dados externos
A aplicação usa, quando conectada:
- `https://statsapi.mlb.com/api/v1/teams/{teamId}/roster`
- `https://statsapi.mlb.com/api/v1/people/{personId}`
- `https://statsapi.mlb.com/api/v1/draft/{year}`
- `https://statsapi.mlb.com/api/v1/draft/prospects`
- fotos em `img.mlbstatic.com`
- logos em `mlbstatic.com`

## Execução
Abra `index.html`.
Caso o navegador bloqueie APIs por ser um `file://`, execute `start_server.bat` e abra:
`http://localhost:8000`

## Próximas fases
1. Estatísticas reais para calibrar ratings.
2. Minor leagues e farm systems.
3. Contracts / arbitration / service time.
4. 40-man roster / options / waivers.
5. Trade engine.
6. Scouting uncertainty.
7. Draft simulator com war room.
8. Injuries.
9. Schedule e standings.
10. Motor 2D de pitching, batting, ball physics, fielding e baserunning.

## Base de dados 2025/2026 (snapshot local)
- `data/roster_snapshot.json`: 30 times, 778 jogadores (elenco ativo 2026: nome real, MLB ID, camisa, posição, B/T, nascimento, estreia) + linha estatística de 2025 quando disponível (347 jogadores). O app usa este arquivo primeiro (offline, sem CORS); a StatsAPI só complementa a ficha (altura/peso).
- Fotos: CDN oficial da MLB pelo ID (`photos.js`); com silhueta/iniciais como fallback.
- Regerar/ampliar: `python3 tools/build_snapshot.py` (snapshot) ou, **no seu PC com internet**, `python tools/fetch_mlb_2025_2026.py` (pacote completo: fotos baixadas, histórico ano a ano, elencos 40-man). Veja `tools/PACOTE_MLB_README.md`.
- Limite: o zip recebido continha apenas o gerador (pasta `output` vazia) e a StatsAPI/CDN são bloqueadas no ambiente de build; por isso fotos locais e histórico ano a ano completo ainda dependem de rodar o gerador.
