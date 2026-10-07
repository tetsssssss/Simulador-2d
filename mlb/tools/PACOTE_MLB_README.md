# MLB 2025/2026 — elencos, fotos e histórico real

Pacote para montar um banco **local e estático** para simuladores/jogos, evitando depender da API da MLB em tempo de execução no navegador ou no Netlify.

## O que o gerador baixa

- 30 equipes da MLB para 2025 e 2026.
- Elenco `active` e `40Man` de cada equipe em cada temporada.
- Nome real e MLB ID de cada jogador.
- Posição, camisa, status de roster, idade, nascimento, altura, peso, lado de rebatida, mão de arremesso, data de estreia e equipe atual quando disponibilizados pela fonte.
- Foto/headshot oficial via CDN da MLB, salva localmente por `player_id`.
- Histórico estatístico MLB ano a ano, separado entre batting e pitching.
- Tabelas globais de hitting, pitching e fielding de 2025 e 2026.
- Logos das equipes.
- Arquivos prontos para app em JSON, CSV e TypeScript.

## Como rodar no Windows

1. Extraia o ZIP inteiro para uma pasta.
2. Dê duplo clique em **GERAR_DADOS_MLB.bat**.
3. Aguarde. O modo completo faz muitas consultas porque monta histórico e baixa centenas de fotos.
4. Ao terminar, abra a pasta `output`.

Não é necessário instalar bibliotecas Python externas. O script usa apenas a biblioteca padrão do Python.

## Estrutura de saída

```text
output/
  manifest.json
  data/
    teams_2025.csv
    teams_2026.csv
    players_master.csv
    players_master.json
    rosters_all.csv
    rosters_all.json
    rosters/
      roster_2025_active.csv
      roster_2025_40Man.csv
      roster_2026_active.csv
      roster_2026_40Man.csv
    stats/
      2025_hitting.csv
      2025_pitching.csv
      2025_fielding.csv
      2026_hitting.csv
      2026_pitching.csv
      2026_fielding.csv
    history/
      <MLB_PLAYER_ID>.json
  photos/
    players/
      <MLB_PLAYER_ID>.png
    teams/
      <MLB_TEAM_ID>.svg
  app_ready/
    mlbPlayers.ts
    mlbTeams.ts
```

## Para o seu app / Netlify

O recomendado é **não chamar a Stats API da MLB diretamente no frontend**. Gere tudo uma vez localmente e copie `output/data`, `output/photos` e/ou `output/app_ready` para a pasta `public` ou `src/data` do projeto.

Exemplo Vite/React:

```text
public/
  mlb/
    data/
    photos/
```

A aplicação passa a carregar arquivos estáticos do próprio Netlify. Isso evita CORS, indisponibilidade da API no ambiente do agente e mudanças de resposta em produção.

## Histórico

O pacote usa `yearByYear` da Stats API para criar histórico estatístico por temporada. O texto `historico_resumido_ptbr` é gerado a partir desses registros, da estreia MLB e das equipes presentes nas linhas históricas. Ele não inventa biografias ou conquistas.

## Fotos

As fotos são baixadas usando o MLB ID. O CDN pode devolver uma silhueta genérica quando não existe headshot disponível. O campo `photo_download_ok` informa se o arquivo foi baixado.

## Limitações importantes

- Um roster é um retrato administrativo, não uma lista perfeita de todos os atletas que passaram pela organização durante o ano. Por isso o pacote também baixa as estatísticas globais `playerPool=ALL` de 2025/2026.
- Jogadores negociados podem aparecer associados a mais de uma equipe em histórico/estatísticas.
- A foto `current` é a foto atualmente servida pelo CDN, não necessariamente a fotografia visual exata usada em cada data de 2025.
- Dados e imagens estão sujeitos aos termos e direitos dos respectivos provedores. Para redistribuição pública/comercial, revise as permissões aplicáveis.

## Se a API estiver bloqueada no Claude/agente

Isso não impede o gerador local. Execute `GERAR_DADOS_MLB.bat` no seu Windows, onde a requisição sai da sua própria conexão. Depois entregue a pasta `output` ao agente, que trabalhará com dados locais.
