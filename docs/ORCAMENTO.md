# Orçamento de desempenho e assets (Etapa 1) — PC e celular (celular ainda sem teste real)

**Premissas (marcadas como proposta, não medida em aparelho):** alvo PC + Android; sem teste em celular por decisão atual → o proxy é o Chromium headless
com CPU limitada 4× (`Emulation.setCPUThrottlingRate`), que **superestima** o custo de canvas (raster por software) e **não** mede GPU, bateria nem térmica.

| Métrica | Meta PC | Meta celular (proposta) | Medido hoje | Situação |
|---|---|---|---|---|
| Fps em partida (4× sim, 30 s, 1×CPU) | ≥ 58 | ≥ 30 (idealmente 60) | NFL 60, NHL 60, **MLB 52** | MLB abaixo (nos dois modos; já constava na fila) |
| p95 do quadro a 1× | ≤ 8 ms | — | 2,4–4,3 ms | ok |
| p95 do quadro a 4× CPU | — | ≤ 16,6 ms | NFL 10–18, NHL 17–19, **MLB 28–32** | MLB e parte da NFL acima da meta |
| Pico de quadro (hitch) | ≤ 50 ms | ≤ 100 ms | **116 ms** no 1º uso do atlas (NFL e MLB, modo sheet) | decodificação do atlas na 1ª jogada: pré-carregar |
| Download inicial (atlas+glb) | ≤ 40 MB | ≤ 25 MB | 16,4 MB assets/sprites (6,2 MB órfãos) + 4 MB exports | ok; apagar órfãos |
| Altura máxima de textura | 4096 | 4096 | 3840 | ok |
| Cache de quadros tingidos | ≤ 130 MB | ≤ 25 MB (≈ 700 quadros) | 65 MB de pior caso (1800 quadros) | reduzir para celular |
| Heap JS | ≤ 400 MB | ≤ 150 MB | 7–17 MB (não conta canvases) | ok |
| Triângulos por atleta (3D) | — | — | 540 (futebol), 500 (hockey), 580 (goleiro) | ver estilo abaixo |
| Textura do atleta | — | — | sem textura/UV | Etapa 3 |

## Faixas de referência para o look (valores aproximados de memória, não de fonte verificada — confira ao escolher o estilo)
* **PS1:** personagem na casa de centenas de triângulos (~300–800), texturas 64–128 px, sem filtro, jitter de vértice. Nosso atleta (540) já cabe.
* **PS2:** milhares (~2–8 mil), texturas 128–512 px. Cabe no PC; para 22 atletas ao mesmo tempo no celular só o protótipo 3D diz.

## Lacunas encontradas (ordem de prioridade)
1. **MLB lento** (52 fps / p95 28–32 ms a 4×): camadas estáticas de estádio/torcida redesenhadas a cada quadro → cache offscreen. Mede-se antes/depois.
2. **Hitch de 116 ms** no 1º uso do atlas: decodificar/pré-aquecer as páginas no carregamento do esporte (ou `createImageBitmap`).
3. **Cobertura de clipes:** 69 ligados de 147 (ver `INVENTARIO_ETAPA1.md`); 56 sem gatilho.
4. **6 atlas antigos órfãos** (6,2 MB) ainda no repositório (apagar com `git rm`).
5. **Fps do MLB como teste**: virar teste automático (soak de 30 s) com limite, para não regredir.

## Como reproduzir
`SECS=30 node <scratch>/soak.mjs` (script de soak: ver `tools/perf/soak.mjs`) e `node tools/anim/inventory.mjs`.
