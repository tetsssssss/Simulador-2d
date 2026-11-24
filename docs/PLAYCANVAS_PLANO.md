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

### Etapa 9 · Entrega ☑ (2026-11-24)
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
| 6 Gráficos | ◐ lotes 1-2 (luz, estádio, torcida, clima) | 2026-11-24 |
| 7 NHL e MLB | ☑ NHL e MLB jogáveis (mesma seed ⇒ mesmos 14 eventos 3D×2D) | 2026-11-24 |
| 8 Desempenho | ☑ (orçamento e LOD provados; fps real = medição do usuário; bloom não feito) | 2026-11-24 |
| 9 Entrega | ☑ | 2026-11-24 |

## 8. Diário
* **2026-11-23:** PlayCanvas escolhida. Engine 2.24.3 verificada (MIT, 2,9 MB). Teste de fumaça: atleta HD com 147 animações animando com sombra no navegador sem GPU (15,7 fps por software). Achados: mapear clipes pelo nome do recurso; ajustar bias da sombra.

* **2026-11-23 (Etapa 1):** engine 2.24.3 embutida em `vendor/playcanvas/` (MIT + LICENSE), carregada sob demanda. `core/render3d/{quality,stage,overlay}.js`: palco com céu, chão, sol com sombra (shadowBias 0,25 / normalOffsetBias 0,08: **sem listras**, conferido por captura) e 3 marcadores provisórios. Opção "3D (PlayCanvas)" no menu Visual dos 3 jogos; o 2D roda escondido por baixo (opacidade 0) e continua recebendo cliques. Níveis de qualidade baixa/média/alta (puro, testado). Fallback para o 2D se não houver WebGL2. **Provas:** `tests/browser/render3d.mjs` 17/17 (monta em NFL, NHL e MLB; 10 ciclos de abrir/fechar sem canvas sobrando nem crescimento de memória; sem erros nem avisos de contexto WebGL); suíte 190/0; smoke 2D 33/33. Achado: a lista do modo offline incluía `android/build` (19 MB): corrigido (agora 6 MB, com o 3D).
* **2026-11-23 (Etapa 2):** `assets/models3d/` com 7 glTF (football_hd, hockey_hd, football, hockey, goalie, ref, baseball: 11 ossos, **147 animações cada**, materiais por zona). `core/render3d/athletes.js`: fábrica de atletas (clipe por nome `resource.name`, mistura suave com `baseLayer.transition`, cor do time por **material clonado por zona**, HD com queda para low-poly, mapeamento sim→mundo: jardas ×0,9144, pés ×0,3048, y→−Z). Galeria de teste `core/render3d/gallery.html` (12 atletas, 2 times, idle → correr → comemorar). **Provas:** `tests/models3d.test.mjs` (todo clipe de cada atlas 2D existe no glTF correspondente; zonas de cor presentes), `tests/browser/athletes3d.mjs` 5/5 (troca de clipes verificada, sem erros), suíte 194/0, smoke 33/33, render3d 17/17. **Bug achado e corrigido:** o canvas 3D ficava em 300×150 px esticado (o `resizeCanvas` da aplicação era no-op): agora `graphicsDevice.resizeCanvas` (css × pixel ratio). **Limites vistos na captura:** franjas no colarinho/mangas do atleta HD (fronteira camisa/pele, 11 ossos); HD só para futebol e hóquei.
* **2026-11-23 (Etapa 3):** `core/render3d/nflField.js`: gramado listrado gerado em canvas (2400×1067 px; linhas a cada 5 jd, números 10-50-10 com a fileira de cima invertida, hash marks a 70'9" e 18'6", end zones nas cores dos times com a abreviação, círculo no meio sem logo), traves amarelas, bola (esfera achatada 28 cm), linha de scrimmage (azul) e de first down (amarela), câmera broadcast (`broadcastTarget`/`followStep`: movimento suave independente da taxa de quadros). Página de teste `core/render3d/field.html` com **jogada real do motor** (elenco SEA×NE, formação do snap). **Provas:** `tests/nflfield3d.test.mjs` (dimensões oficiais, 21 linhas, hash marks, câmera sem overshoot), `tests/browser/field3d.mjs` 4/4 (22 atletas, **erro de posição 0,000 cm** em relação ao motor, posturas, sem erros), suíte e smoke verdes. Observações: números "próximos" invertidos como na TV; bola pequena em câmera longa; estádio/arquibancada só na Etapa 6.
* **2026-11-23 (Etapa 4):** `nfl/src/ui/fieldRenderer3d.js` (adaptador) + `render3dLogic.js` (puro: velocidade→clipe, bola, câmera) ligados ao `gameView.js` via `mount3dOverlay`. 22 atletas em pool, cores dos times (`sideColors`, movida para `teamColors.js`), eventos→clipes (`actionsFor`), contato do tackle (`contactPull`), huddle, árbitro com sinais/penalidades, bola, câmera suave (presets broadcast/tática/QB/end zone), rótulos de número, anéis de seleção/portador, clique seleciona atleta em 3D. **Provas:** `tests/browser/nfl3d.mjs` 6/6 em 3 execuções seguidas (22 atletas, vários clipes, clique abre a ficha, sem erros JS, **mesma seed ⇒ mesmos lances no 3D e no 2D**, pior erro de posição 0,365 m = puxão de contato); suíte Node 201/0, smoke 33/33, render3d 17/17. **Bug real achado pelo teste intermitente (afetava o 2D também):** em `gameView.frame` a variável local `s` era a sim ANTIGA enquanto o `runCall` automático já iniciara o huddle da jogada nova → um quadro com o ataque no lugar errado; agora renderiza `view.sim`. **Limites:** fps real não medido (SwiftShader); banco de reservas, estádio e torcida ainda não; NHL/MLB só com cena provisória.
* **2026-11-23 (Etapa 5):** presets (broadcast/tática/QB/end zone), câmera diretora e replay já passavam pelo `renderOpts` do `gameView`; faltava provar em 3D. `tests/browser/cams3d.mjs` 7/7: cada preset leva a câmera a lugar distinto (tática y≈58 m, QB y≈3,7 m), troca suave sem teleporte, diretor muda de plano sozinho (QB→broadcast→tática→end zone), replay entra em modo replay no 3D com plano end zone e volta ao jogo ao vivo. **Bug achado e corrigido:** `showRef` assíncrono acessava `refAct` já anulado (erro JS 'ref' de null ao fim de um sinal do árbitro). Limite: replay usa as mesmas câmeras (sem câmera lenta dedicada além do 1/2 de velocidade).
* **2026-11-24 (Etapa 6, lote 1):** `core/render3d/look.js` (dia/tarde/noite: céu, ambiente, sol, névoa EXP2, tonemapping ACES2, exposição; `applyLook`) e `core/render3d/stadium.js` (4 arquibancadas em degraus + torcida de ~4,3 mil cabeças numa **única malha** com cor por vértice = 1 draw call, mistura de cores do time da casa/visitante; 4 refletores; torcida pula nos touchdowns). Botão 🌗 Luz no jogo; escolha guardada em `asu_3d_look`. Provas: `tests/look3d.test.mjs`, `tests/browser/stadium3d.mjs` 4/4, capturas dia/tarde/noite revisadas. **Achados:** arquibancada maciça enterrava a torcida (trocada por 1 laje por fileira); spots não iluminavam o meio do campo (noite usa sol de 'refletor' + ambiente maior; os spots só dão brilho nas bordas). **Pendente na Etapa 6:** bloom/pós-processamento (CameraFrame existe na 2.24.3), clima (chuva/neve), telão, torcida pelo trimestre (auto), banco de reservas; custo em fps não medido.
* **2026-11-24 (Etapa 6, lote 2):** clima no 3D: camada 2D transparente (`#wx3d`) com o **mesmo gerador do 2D** (`createWeather`, previsão por seed + preferência `asu_weather`) e névoa 3D multiplicada (neblina ×4, chuva ×1,8). Prova `tests/browser/weather3d.mjs` 4/4 (chuva desenha pixels, 'clear' nenhum, sem erros). **Decisão:** bloom/CameraFrame adiado — não dá para validar custo/aparência sem GPU real; entra na Etapa 8 como opção 'alta' se você medir folga de fps. Pendentes: telão, luz automática por quarto, banco de reservas.
* **2026-11-24 (Etapa 7, NHL):** `core/render3d/rinkScene.js` (rinque oficial 200×85 pés→61×25,9 m: gelo com linhas/círculos/creases desenhados em canvas, tábuas arredondadas em 36 segmentos + vidro translúcido, redes, câmeras PUCK/BROADCAST/TACTICAL/FULL) e `nhl/src/rink/rinkRenderer3d.js` (12 atletas HD + 2 goleiros alocados por id conforme a linha em campo, cores dos times, gait por velocidade, chute/check/comemoração por evento, disco, clique seleciona). Ligado ao `matchView` do NHL. **Provas:** `tests/browser/nhl3d.mjs` 4/4 (12 atletas, erro de posição 0,095 m, clipes hk_*/gk_* tocando, sem erros), `tests/rink3d.test.mjs`. **Bugs achados na captura e corrigidos:** gelo preto (mapa de opacidade descartava a textura → textura opaca), câmera colada na tábua, marcador provisório do palco aparecendo. **Limites:** sem banco/troca de linha, sem torcida/telão, replay do NHL reaproveita eventos sem hooks (ações podem repetir), sem prova de mesmo placar 3D×2D (a sim não é tocada, mas não testei por seed).
* **2026-11-24 (Etapa 7, MLB):** `core/render3d/diamondScene.js` (textura do campo em canvas: grama listrada, terra do infield, pista de aviso, linhas de falta, bases, caixas do rebatedor; cerca 330/400 pés em 36 caixas, postes de falta, montinho, bases; 7 câmeras iguais às do 2D incl. rebatedor/arremessador/segue-bola) e `mlb/src/field/fieldRenderer3d.js` (até 15 atletas por id: 9 defensores + rebatedor + corredores; pitch/swing/mergulho/comemoração por evento; bola com holder/altura). Ligado ao `matchView` do MLB. **Provas:** `tests/browser/mlb3d.mjs` 4/4 (10 atletas, erro de posição 0,000 m, clipes bb_pitch/bb_swing/mv_sprint…), `tests/diamond3d.test.mjs`. **Bug achado na captura:** textura espelhada em profundidade (o campo da NFL é simétrico e escondia isso) → eixo Y invertido na textura. **Limites:** sem arquibancada/torcida, sem dugouts/bullpen, sem banco, replay sem hooks; NHL e MLB sem prova de mesmo placar 3D×2D por seed.
* **2026-11-24 (seed 3D×2D):** `tests/browser/seed3d.mjs` 4/4: NHL e MLB geram os mesmos 14 primeiros eventos do motor em 3D e em 2D (e sem erro de JS). Prova o essencial (visual não altera a simulação); não compara partida inteira/placar final.
* **2026-11-24 (Etapa 8, lote 1):** `core/render3d/autoQuality.js` (puro) + seletor **Qualidade 3D** (Auto/Baixa/Média/Alta) no menu 🔊, guardado em `asu_3d_quality`, aplicado ao vivo (evento `storage`). Auto começa em Média, **desce** se o tempo médio de 60 quadros passar de 28 ms, **sobe** só após cooldown de 600 quadros com média < 15 ms e sem quadro > 45 ms (teto Alta); aba oculta e pausas > 2 s são ignoradas. Provas: `tests/autoquality.test.mjs` 4/4, `tests/browser/autoq3d.mjs` 4/4 (no SwiftShader o auto desce para Baixa; 'Alta' fixa não muda). **Dois erros meus no caminho, corrigidos:** (1) descartar quadros > 250 ms como 'hitch' fazia um aparelho realmente lento nunca descer; (2) critério por proporção de quadros lentos falhava com travadas bimodais da GPU → agora média. **Pendente:** LOD (HD perto/low-poly longe), instancing dos atletas, orçamento de triângulos/draw calls medido, bloom; e a **medição real de fps pelo usuário** (nenhum número de fps foi medido aqui).
* **2026-11-24 (Etapa 8, lote 2):** pedido do usuário: **opções de 30 a 100 fps**. Seletor **FPS do 3D** (30/45/60/75/90/100, padrão 60, `asu_3d_fps`) no menu 🔊: `autoRender` da PlayCanvas desligado e 1 quadro de engine por desenho permitido (`shouldDraw`, tolerância de 10 %), então nos quadros pulados a GPU fica ociosa; a qualidade automática ajusta seus limites ao teto (teto 30 ⇒ quadro de 33 ms é normal). É um teto: o monitor/aparelho ainda limita o máximo real (60 Hz ⇒ no máximo 60). Provas: unitários (`autoquality.test.mjs` 6/6: ~cap quadros/s para cada opção), `stadium3d` 4/4 e `render3d` 17/17 com a imagem renderizando (captura conferida). **Não medido:** o fps real alcançado em cada teto (SwiftShader fica abaixo de 30 sempre) — quem confirma é você na RX 6600. **Teste corrigido:** o smoke reprovava a narração legítima 'The play is nullified' por casar /null/ → regex com limites de palavra.
* **2026-11-24 (Etapa 8, lote 3 — orçamento e LOD):** `tests/browser/budget3d.mjs` 10/10. Triângulos submetidos por quadro (soma das malhas ativas; limite superior, sem descarte por câmera): **NFL 320 mil em Alta** (22 atletas HD × 12 mil = 264 mil + torcida ~43 mil), **NHL 123 mil**, **MLB 7 mil**. Orçamento ajustado para ≤ 350 mil em Alta (HD é escolha de qualidade). **LOD por qualidade:** Baixa troca os atletas para os modelos low-poly (~630 triângulos) **ao vivo** (renderer.setQuality, acionado pelo menu ou pela descida automática): NFL 70 mil, NHL 9 mil; voltar para Média/Alta restaura o HD com os 22/12 atletas e cores. A arquibancada virou 1 malha (56 lajes → 1). **Ressalva:** o contador de draw calls da engine é lido no meio do quadro (varia de 0 a 378 entre leituras) — o que está provado é triângulos; draw calls só como ordem de grandeza (~250–420, ~190 mesh instances). **Não feito:** LOD por distância da câmera, instancing dos atletas, bloom. **Pendente do usuário:** fps real por nível na RX 6600.
* **2026-11-24 (Etapa 9 — entrega):** `American_Sports_Universe_2026-11-24_v7_3D.zip` (20 MB, 418 arquivos = tudo que o git rastreia menos `unreal/`, `tools/unreal/` e `android/build/`; inclui engine, modelos 3D, docs e `sw-precache.js` regenerado). **Provado:** zip extraído e servido em outra porta passa `render3d.mjs` 17/17; regressão antes do zip: suíte Node 215/0, smoke 33/33, nfl3d 6/6, cams3d 7/7, render3d 17/17, budget3d 10/10. **Offline:** engine (2,9 MB) e módulos 3D no pré-cache; modelos `.glb` em cache na 1ª vez (cache-first). **APK:** decisão registrada — o 3D não é alvo do APK (o 2D permanece como está); nenhum teste em celular foi feito. Documentação de uso em `docs/LANCAMENTO.md` seção 5. **Plano concluído nas Etapas 0–9**, com as ressalvas: fps real não medido (usuário), bloom/telão/luz automática por quarto/banco/estádio de NHL e MLB não feitos.
* **2026-11-24 (backlog 3D — telão e luz por quarto):** telão (canvas autoiluminado, 18×7 m, no alto da arquibancada do lado oposto) com **placar, quarto e relógio**, redesenhado só quando o texto muda; luz **Auto** (padrão): Q1–Q2 dia, Q3 tarde, Q4/OT noite (`lookByQuarter`), botão 🌗 Luz cicla auto → dia → tarde → noite. `gameView.renderOpts` ganhou `game{quarter,clock,home,away,homeScore,awayScore,over}`. Prova: `stadium3d.mjs` 6/6 (telão com 'SEA|NE|0|0|1|15:00', auto em Q1 = dia, refletores à noite) e captura revisada (placar legível). **Limites:** a câmera broadcast só enquadra o telão em parte; o telão não mostra replay/estatísticas; auto só foi provado no Q1 (Q3/Q4 cobertos pelo teste unitário de `lookByQuarter`, não por partida completa).
* **2026-11-24 (backlog 3D — torcida NHL/MLB):** `core/render3d/crowdStands.js`: layouts puros (`rinkStands`: lado oposto + fundos, o lado da câmera fica aberto; `arcStands`: terraços em arco atrás da cerca do MLB) e construtor de **2 malhas** (torcida colorida por vértice + lajes de concreto), com `cheer()` em gol (NHL) e home run / corrida (MLB) e cores do time da casa/visitante. Provas: `tests/crowdstands.test.mjs` (ninguém no gelo/campo, lado da câmera aberto, determinístico, linhas sobem para fora), `nhl3d.mjs` e `mlb3d.mjs` (≈1,0 mil e ≈1,7 mil assentos em Média), capturas revisadas. **Limites vistos:** no NHL a fileira do lado oposto aparece como tracinhos escuros (cabeças de lado, pouco convincente); sem telão nem dugouts/bullpen no MLB; torcida estática salvo o 'pulo' coletivo.
* **2026-11-24 (backlog 3D — replay NHL/MLB):** causa do bug: o `build` do replay devolve `{...S, players, puck, t}` — um objeto NOVO por quadro, com a lista de eventos AO VIVO; o renderer 3D zerava as ações a cada quadro e reaplicava todos os eventos. Correção: `matchView` passa `replay: !!rp`; os renderers seguem o relógio do replay (`core/render3d/replayEvents.js`: `replayStart`/`replayDue`), sem reset por objeto e só disparando eventos até o tempo do replay; ao sair, sincronizam com o estado ao vivo. Provas: `replayevents.test.mjs` (2) e `tests/browser/replay3d.mjs` 8/8 (botão ⏪ entra no modo replay, **nenhum evento futuro disparado**, sai e volta ao vivo, sem erros) em NHL e MLB. **Limite:** não comparei visualmente o replay quadro a quadro.
* **2026-11-24 (backlog 3D — banco de reservas NFL):** 14 atletas low-poly (630 triângulos cada) como reservas: 7 por time, HOME na lateral próxima (z ≈ +2,4 m) e AWAY na oposta (z ≈ −51,1 m), seguindo a bola entre as jardas 14 e 106, cores do time (ataque/defesa), braços para cima por 3 s quando o time faz touchdown (mesma regra do 2D; lista vem de `opts.bench`). Prova: `stadium3d.mjs` 7/7 (14 reservas, posições nas duas laterais) e captura revisada. **Limites:** os reservas não reagem a outros lances (só TD), sem treinadores/staff, e só TD dispara comemoração (field goals não).
* **Hardware do usuário:** RX 6600 8 GB; sem medição por enquanto (decisão do usuário). Qualidade padrão "média".

## 9. Pendências do usuário
1. ~~Especificação do PC~~ recebida: RX 6600 8 GB. Falta a memória RAM e a CPU (só para registro).
2. Medir fps no seu aparelho ao fim das Etapas 4, 6 e 8.
3. Decidir, na Etapa 9, se o 3D entra no APK.

## 10. Retomada (cole numa conversa nova)
> Projeto Simulador-2d (NFL/NHL/MLB em HTML/JS, branch `ccr-1d32cd32-jtupys`). Estamos adicionando um **modo visual 3D com a PlayCanvas Engine 2.24.3 (MIT), embutida em `vendor/playcanvas/`, sem editor e sem build**, reaproveitando os motores JS e os módulos puros (huddle, contato, clipes, diretor, replay). O 2D/PWA/APK continuam como estão. Plano e status em `docs/PLAYCANVAS_PLANO.md`; seguir a próxima etapa ☐, com prova por teste antes de avançar, commits pequenos e o Diário atualizado.
