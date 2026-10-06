# American Sports Universe 2D — NFL Alpha

Aplicativo web local gerado no ChatGPT. Esta entrega começa pela NFL e foi estruturada para receber MLB e NHL no mesmo universo futuramente.

## O que já existe

- 32 franquias atuais
- logos resolvidos por URL pública
- roster 2026 sincronizável do nflverse
- nome, posição, jersey, status, college, idade, experiência, altura, peso e IDs
- fotos/headshots por `headshot_url` com fallback via ESPN ID
- 50 atributos próprios, escala 1–200, determinísticos por jogador/posição
- overall calculado por função posicional
- College Explorer
- histórico de Super Bowl I a LX
- partida 2D 11 x 11 **simulada** (v0.3): bloqueios, pass rush, rotas, cobertura, leituras do QB, bola com trajetória, tackles; box score por eventos; modo debug
- jogo corrido (v0.4): zone/duo/power/counter/trap com double team e climb, leitura de lanes do RB, cut/juke/spin/stiff arm/truck; debug mostra lanes, scores e decisões
- modo carreira local
- trade center
- lesões
- rivalidades
- save em `localStorage`
- importação manual de `roster_2026.csv` se a rede bloquear a sincronização

## Como abrir

### Opção 1
Abra `index.html`. Se o navegador permitir o download do CSV remoto, o roster será sincronizado.

Sem rede (ou com bloqueio CORS do GitHub, que é o caso normal em navegadores), o app usa o snapshot local
`data/roster_2026.csv` — mas o navegador só lê arquivos locais via servidor (Opção 2).

### Opção 2 — recomendada
No Windows, dê dois cliques em `START_APP.bat`. Isso inicia um servidor local e abre o navegador em `http://localhost:8765`.

## Sobre as fotos e logos

O ZIP não embute milhares de fotografias de atletas nem logos proprietários. As imagens são resolvidas em tempo de execução usando URLs fornecidas pela base pública de roster e um endpoint público de logos. Quando não há headshot disponível, o app mostra uma silhueta local, nunca uma imagem inventada do atleta.

## Testes (v0.4)

Requer Node 18+ (sem dependências): `npm test`, `node tests/harness.mjs 1000 mix` (SEA × NE) e
`node tests/league.mjs 80 mix` (32 times — referência de calibração; ver `docs/CALIBRATION_v04.md`).

## Fonte de dados

Roster: nflverse `roster_2026.csv`. O projeto separa os dados de roster do sistema próprio de ratings para não copiar ratings comerciais/proprietários.

## Próximos módulos recomendados

1. depth chart 2026 por slot
2. contratos e salary cap
3. draft/prospects college completos
4. playbooks reais estruturados
5. motor de bloqueios e coberturas por assignment
6. temporada/schedule completos
7. estatísticas e record book
8. free agency
9. staff/coaches
10. expansão MLB e NHL
