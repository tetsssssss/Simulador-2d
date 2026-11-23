# Plano contínuo: modo 3D com PlayCanvas (NFL, NHL, MLB)

> Documento vivo: atualizar o **Status** e o **Diário** ao fim de cada lote. Para retomar numa conversa nova, cole a seção "Retomada" do fim.
> Decisão do usuário (2026-11-23): **PlayCanvas**, reaproveitando os motores JavaScript. O jogo 2D atual (web, PWA, APK Android) **continua como está**; o 3D entra como um novo **modo visual**.

## 1. Objetivo, restrições e critério de sucesso
* **Objetivo:** partidas de NFL, NHL e MLB em 3D com visual de ponta (atletas HD animados, estádio, iluminação, câmeras de TV, replay), sobre as **mesmas regras e resultados** do jogo atual.
* **Restrições:** não reescrever os motores (183 testes); sem custo de licença; sem etapa de build (o projeto é HTML/JS puro); funcionar offline; não piorar o modo 2D.
* **Sucesso por esporte:** partida completa no modo 3D, com o mesmo placar que o 2D para a mesma seed, **60 fps num PC com placa dedicada** (medida do usuário) e ≥ 30 fps num PC/notebook comum no modo de qualidade "média".

## 2. Fatos verificados (2026-11-23)
| Item | Fato | Como foi verificado |
|---|---|---|
| Versão | PlayCanvas Engine **2.24.3** (npm `latest`, publicada em 2026-11-23); `lts` = 1.77.0 | registro do npm |
| Licença | **MIT**: grátis, uso comercial, sem limite de receita. Exige manter o aviso de copyright/licença junto do arquivo | `package.json` do pacote. **Conferir** o arquivo LICENSE ao incorporar |
| Arquivo | `build/playcanvas.min.mjs` = **2,9 MB**, um único módulo ES (cabe no projeto sem build) | pacote baixado |
| Editor online | **não será usado** (o plano grátis só tem projetos públicos; não precisamos dele) | página de planos (busca de hoje) |
| Roda aqui | WebGL2 no Chromium headless; o atleta HD (`exports/anim/athlete_football_hd.glb`) carrega com **147 animações**, anima e projeta sombra | teste de fumaça desta sessão |
| Desempenho aqui | 15,7 fps em renderização **por software** (sem GPU) | **não representativo**: medir no PC do usuário |
| Detalhes achados | nomes das animações chegam como caminho (`…glb/animation/0`): mapear pelo nome do recurso; a sombra no chão faz listras (*shadow acne*): ajustar o *bias* | teste de fumaça |

## 3. Decisões de arquitetura
| Decisão | Escolha | Alternativa descartada e por quê |
|---|---|---|
| Como usar a PlayCanvas | **Só a engine (MIT), embutida no repositório** em `vendor/playcanvas/` | Editor online: grátis só com projeto público e cria um segundo lugar para o código |
| Onde entra o 3D | **Novo modo visual "3D"** dentro dos jogos atuais (mesmo menu, carreira, saves, narração) | App 3D separado: duplicaria interface, carreira e saves |
| Interface do renderizador | o 3D implementa a **mesma interface dos renderizadores 2D** (`render(estado, alpha, opções)`, `resize`, `pick`, `dispose`) | Integração ad hoc: quebraria replay, câmera diretora e seleção de jogador |
| Lógica reaproveitada | módulos puros que já existem: `huddlePose`, `contactPull`, `actionsFor`/`throwClipId`/`catchClipId`, `runGait`/`skateGait`, `director.js`, `replay.js`/`instantReplay.js`, `buildSignal` (árbitro), clima | Reescrever para o 3D: perderia os testes |
| Unidades | 1 unidade = 1 metro. NFL em jardas × 0,9144; NHL e MLB em pés × 0,3048 | |
| Atletas | `.glb` com esqueleto de 11 ossos e materiais por zona (`asu_jersey`, `asu_pants`, …): **cor do time trocando a cor do material**, não textura | Texturas por time: arte que não existe ainda |
| Android | o 3D fica **opcional e fora do APK** no início; o 2D continua o padrão no celular | Forçar 3D no celular: risco de desempenho |

## 4. Etapas (cada uma só avança com a prova cumprida)
Legenda: ☐ a fazer · ◐ em andamento · ☑ feito

### Etapa 0 · Viabilidade ☑
* Teste de fumaça: engine 2.24.3 + atleta HD + animação + sombra no navegador sem GPU. **Feito em 2026-11-23.**

### Etapa 1 · Base 3D no projeto ☑ (2026-11-23)
* Incorporar `vendor/playcanvas/playcanvas.min.mjs` (+ `LICENSE`) e registrá-lo no cache offline (`tools/build_sw_manifest.mjs`).
* `core/render3d/stage.js`: cria a aplicação PlayCanvas num `<canvas>`, céu, luz direcional com sombra (bias ajustado), câmera, redimensionamento e **descarte completo** (sem vazar contexto WebGL ao trocar de esporte ou de modo).
* Opção "**3D (PlayCanvas)**" no seletor *Visual* dos três jogos; se o WebGL2 não existir, avisa e volta ao 2D.
* **Entrega:** cena vazia com chão e luz no lugar do campo 2D.
* **Prova:** teste de navegador abre/fecha o modo 3D 10 vezes sem erro e sem crescer a memória; o smoke 2D continua 33/33.

### Etapa 2 · Atletas 3D ☑ (2026-11-23)
* `core/render3d/athletes.js`: carrega o `.glb` uma vez por kit, cria instâncias, **mapeia as 147 animações pelo nome**, troca de clipe com mistura suave (*crossfade*) e aplica as cores do time (camisa, calça, capacete, acento) por material.
* Exportar `.glb` que faltam: goleiro, árbitro, beisebol (rebatedor e campo) pelo pipeline do Blender (`build_nfl_sprites.py --glb`).
* **Entrega:** galeria de teste com os kits em pé, correndo e comemorando, com cores de 2 times.
* **Prova:** captura de tela comparada; teste unitário do mapeamento de clipes (nenhum clipe usado pelo jogo fica sem animação).

### Etapa 3 · Campo da NFL e bola ☑ (2026-11-23)
* Gramado com faixas, linhas de jarda e números (textura gerada em canvas, sem logos de terceiros), end zones, traves, bola com rotação no ar, marcador de first down.
* Câmera "broadcast" seguindo a bola.
* **Prova:** captura de uma jogada parada, com as 22 posições batendo com o 2D.

### Etapa 4 · NFL jogável em 3D ☑ (2026-11-23; banco de reservas fica para a Etapa 6)
* Adaptador `nfl/src/ui/fieldRenderer3d.js`: estado da simulação → 22 atletas (posição, direção, clipe de locomoção por velocidade), eventos → clipes de ação (`actionsFor`), contato do tackle (`contactPull`), huddle, árbitro e sinais, banco de reservas, rótulos de nome.
* **Prova:** partida inteira no modo 3D sem erro; **mesmo placar do 2D** para a mesma seed (teste automático); seleção de jogador funciona.

### Etapa 5 · Câmeras e replay ☑ (2026-11-23)
* Presets 3D: broadcast, tática (alta), atrás do QB, end zone; câmera diretora (`director.js`); replay automático em TD/turnover (`replay.js`) com câmera alternativa e câmera lenta.
* **Prova:** teste de navegador dispara replay e verifica a troca de câmera.

### Etapa 6 · "Gráficos incríveis" ☐ (o salto visual)
* Iluminação: dia, fim de tarde e noite com refletores; sombras suaves; ambiente (HDRI de licença livre CC0, **conferir a licença do arquivo escolhido**).
* Pós-processamento: tonemapping, bloom, oclusão de ambiente, profundidade de campo nos replays (**conferir os nomes das APIs na 2.24**).
* Estádio: arquibancadas, torcida instanciada que reage a lances, telão com o placar, clima (chuva/neve em partículas, gramado molhado).
* **Prova:** capturas antes/depois; medida de fps em cada nível de qualidade.

### Etapa 7 · NHL e MLB em 3D ☐
* NHL: rinque com gelo reflexivo, placas e vidro, redes, goleiro HD, disco; troca de linha e bancos.
* MLB: diamante, montinho, rebatedor com taco, trajetória da bola com rastro, dugouts e bullpen.
* **Prova:** partida completa de cada um no modo 3D, mesmo placar do 2D.

### Etapa 8 · Desempenho e qualidade ☐
* Orçamento: ≤ 300 mil triângulos em cena, ≤ 30 chamadas de desenho por atleta-tipo (instancing onde der); LOD (HD perto, low-poly longe); níveis de qualidade **baixa / média / alta** com escolha automática pela primeira medição.
* **Prova:** tabela de fps e memória **medida pelo usuário** (menu 🔊 → Mostrar FPS) no PC e, se quiser, num celular forte.

### Etapa 9 · Entrega ☐
* Zip, cache offline, docs; decidir com o usuário se o 3D vai no APK (provavelmente não, pelo tamanho e desempenho).

## 5. Riscos e o que fazer
| Risco | Probabilidade | Mitigação |
|---|---|---|
| Desempenho ruim em PCs sem placa dedicada | média | níveis de qualidade, LOD, sombras opcionais; o 2D continua disponível |
| Animações de 11 ossos parecem "rígidas" de perto | alta | câmera de TV a média distância; mais ossos (mãos, pescoço) é uma etapa de arte futura no Blender |
| Atletas HD sem textura (sem rosto e número) | certa | número/nome em decalque simples; rosto fica para arte nova (Meshy texturizado, se o usuário quiser) |
| Mudança de API entre versões da PlayCanvas | baixa | versão travada no arquivo embutido; atualizar só de propósito |
| Marcas e direitos (ligas, jogadores) | — | iguais ao 2D: ver `docs/LANCAMENTO.md` |

## 6. Como cada etapa é verificada aqui
* Testes Node (lógica pura) + **Playwright com WebGL2 por software** (capturas e checagens de cena) — funciona neste ambiente.
* O que **não** dá para medir aqui: fps real e aparência com GPU. Isso fica com o usuário em cada etapa visual.

## 7. Status
| Etapa | Estado | Última atualização |
|---|---|---|
| 0 Viabilidade | ☑ | 2026-11-23 |
| 1 Base 3D | ☑ | 2026-11-23 |
| 2 Atletas | ☑ | 2026-11-23 |
| 3 Campo NFL | ☑ | 2026-11-23 |
| 4 NFL jogável | ☑ | 2026-11-23 |
| 5 Câmeras e replay | ☑ | 2026-11-23 |
| 6 Gráficos | ☐ | — |
| 7 NHL e MLB | ☐ | — |
| 8 Desempenho | ☐ | — |
| 9 Entrega | ☐ | — |

## 8. Diário
* **2026-11-23:** PlayCanvas escolhida. Engine 2.24.3 verificada (MIT, 2,9 MB). Teste de fumaça: atleta HD com 147 animações animando com sombra no navegador sem GPU (15,7 fps por software). Achados: mapear clipes pelo nome do recurso; ajustar bias da sombra.

* **2026-11-23 (Etapa 1):** engine 2.24.3 embutida em `vendor/playcanvas/` (MIT + LICENSE), carregada sob demanda. `core/render3d/{quality,stage,overlay}.js`: palco com céu, chão, sol com sombra (shadowBias 0,25 / normalOffsetBias 0,08: **sem listras**, conferido por captura) e 3 marcadores provisórios. Opção "3D (PlayCanvas)" no menu Visual dos 3 jogos; o 2D roda escondido por baixo (opacidade 0) e continua recebendo cliques. Níveis de qualidade baixa/média/alta (puro, testado). Fallback para o 2D se não houver WebGL2. **Provas:** `tests/browser/render3d.mjs` 17/17 (monta em NFL, NHL e MLB; 10 ciclos de abrir/fechar sem canvas sobrando nem crescimento de memória; sem erros nem avisos de contexto WebGL); suíte 190/0; smoke 2D 33/33. Achado: a lista do modo offline incluía `android/build` (19 MB): corrigido (agora 6 MB, com o 3D).
* **2026-11-23 (Etapa 2):** `assets/models3d/` com 7 glTF (football_hd, hockey_hd, football, hockey, goalie, ref, baseball: 11 ossos, **147 animações cada**, materiais por zona). `core/render3d/athletes.js`: fábrica de atletas (clipe por nome `resource.name`, mistura suave com `baseLayer.transition`, cor do time por **material clonado por zona**, HD com queda para low-poly, mapeamento sim→mundo: jardas ×0,9144, pés ×0,3048, y→−Z). Galeria de teste `core/render3d/gallery.html` (12 atletas, 2 times, idle → correr → comemorar). **Provas:** `tests/models3d.test.mjs` (todo clipe de cada atlas 2D existe no glTF correspondente; zonas de cor presentes), `tests/browser/athletes3d.mjs` 5/5 (troca de clipes verificada, sem erros), suíte 194/0, smoke 33/33, render3d 17/17. **Bug achado e corrigido:** o canvas 3D ficava em 300×150 px esticado (o `resizeCanvas` da aplicação era no-op): agora `graphicsDevice.resizeCanvas` (css × pixel ratio). **Limites vistos na captura:** franjas no colarinho/mangas do atleta HD (fronteira camisa/pele, 11 ossos); HD só para futebol e hóquei.
* **2026-11-23 (Etapa 3):** `core/render3d/nflField.js`: gramado listrado gerado em canvas (2400×1067 px; linhas a cada 5 jd, números 10-50-10 com a fileira de cima invertida, hash marks a 70'9" e 18'6", end zones nas cores dos times com a abreviação, círculo no meio sem logo), traves amarelas, bola (esfera achatada 28 cm), linha de scrimmage (azul) e de first down (amarela), câmera broadcast (`broadcastTarget`/`followStep`: movimento suave independente da taxa de quadros). Página de teste `core/render3d/field.html` com **jogada real do motor** (elenco SEA×NE, formação do snap). **Provas:** `tests/nflfield3d.test.mjs` (dimensões oficiais, 21 linhas, hash marks, câmera sem overshoot), `tests/browser/field3d.mjs` 4/4 (22 atletas, **erro de posição 0,000 cm** em relação ao motor, posturas, sem erros), suíte e smoke verdes. Observações: números "próximos" invertidos como na TV; bola pequena em câmera longa; estádio/arquibancada só na Etapa 6.
* **2026-11-23 (Etapa 4):** `nfl/src/ui/fieldRenderer3d.js` (adaptador) + `render3dLogic.js` (puro: velocidade→clipe, bola, câmera) ligados ao `gameView.js` via `mount3dOverlay`. 22 atletas em pool, cores dos times (`sideColors`, movida para `teamColors.js`), eventos→clipes (`actionsFor`), contato do tackle (`contactPull`), huddle, árbitro com sinais/penalidades, bola, câmera suave (presets broadcast/tática/QB/end zone), rótulos de número, anéis de seleção/portador, clique seleciona atleta em 3D. **Provas:** `tests/browser/nfl3d.mjs` 6/6 em 3 execuções seguidas (22 atletas, vários clipes, clique abre a ficha, sem erros JS, **mesma seed ⇒ mesmos lances no 3D e no 2D**, pior erro de posição 0,365 m = puxão de contato); suíte Node 201/0, smoke 33/33, render3d 17/17. **Bug real achado pelo teste intermitente (afetava o 2D também):** em `gameView.frame` a variável local `s` era a sim ANTIGA enquanto o `runCall` automático já iniciara o huddle da jogada nova → um quadro com o ataque no lugar errado; agora renderiza `view.sim`. **Limites:** fps real não medido (SwiftShader); banco de reservas, estádio e torcida ainda não; NHL/MLB só com cena provisória.
* **2026-11-23 (Etapa 5):** presets (broadcast/tática/QB/end zone), câmera diretora e replay já passavam pelo `renderOpts` do `gameView`; faltava provar em 3D. `tests/browser/cams3d.mjs` 7/7: cada preset leva a câmera a lugar distinto (tática y≈58 m, QB y≈3,7 m), troca suave sem teleporte, diretor muda de plano sozinho (QB→broadcast→tática→end zone), replay entra em modo replay no 3D com plano end zone e volta ao jogo ao vivo. **Bug achado e corrigido:** `showRef` assíncrono acessava `refAct` já anulado (erro JS 'ref' de null ao fim de um sinal do árbitro). Limite: replay usa as mesmas câmeras (sem câmera lenta dedicada além do 1/2 de velocidade).
* **Hardware do usuário:** RX 6600 8 GB; sem medição por enquanto (decisão do usuário). Qualidade padrão "média".

## 9. Pendências do usuário
1. ~~Especificação do PC~~ recebida: RX 6600 8 GB. Falta a memória RAM e a CPU (só para registro).
2. Medir fps no seu aparelho ao fim das Etapas 4, 6 e 8.
3. Decidir, na Etapa 9, se o 3D entra no APK.

## 10. Retomada (cole numa conversa nova)
> Projeto Simulador-2d (NFL/NHL/MLB em HTML/JS, branch `ccr-1d32cd32-jtupys`). Estamos adicionando um **modo visual 3D com a PlayCanvas Engine 2.24.3 (MIT), embutida em `vendor/playcanvas/`, sem editor e sem build**, reaproveitando os motores JS e os módulos puros (huddle, contato, clipes, diretor, replay). O 2D/PWA/APK continuam como estão. Plano e status em `docs/PLAYCANVAS_PLANO.md`; seguir a próxima etapa ☐, com prova por teste antes de avançar, commits pequenos e o Diário atualizado.
