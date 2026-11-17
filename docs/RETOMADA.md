# RETOMADA (atualizado a cada lote) — cole este arquivo numa conversa nova
Projeto: American Sports Universe 2D (repo tetsssssss/Simulador-2d, branch ccr-1d32cd32-jtupys, PR #1 draft, base ccr-5a429fbb-sg9yv2).
Regra do usuário: trabalhar em lotes ininterruptos, sem pedir confirmação; manter ESTE arquivo atualizado ao fim de cada lote (o contexto pode ser compactado/limpo a ~45%; não consigo medir % nem limpar sozinho — por isso o arquivo).
Plano: docs/PLANO_ACAO_VISUAL.md (9 etapas). Alvo PC + Android, sem teste em celular (proxy: Chromium headless CPU 4×). Inventário: docs/INVENTARIO_ETAPA1.md; orçamento: docs/ORCAMENTO.md.
## Estado
- Etapa 1 feita. Lote atual: ver "Fila" abaixo.
## Fila (ordem)
1. Cache offscreen das camadas estáticas do MLB (fps 52 → 60; p95 4×: 28–32 ms → ≤16,6)
2. Pré-aquecer atlas (hitch 116 ms)
3. Soak test com limites (tools/perf/soak.mjs → tests)
4. Etapa 2: folha de estilo PS1 vs PS2 (2 renders) — escolher padrão sem esperar o usuário, marcar como trocável
## Feito neste arquivo
- Pré-decode/preload dos atlas commitado (3dc464c); npm test 136/0. MLB sheet ainda max ~133 ms (perf MLB segue aberto).
- Etapa 2: docs/anim/style_ps1_vs_ps2.png (bpy 5.1). DECISÃO: PS2 (96 px, suavizado) é o padrão; PS1 (48 px, sem AA, cor reduzida) fica como filtro opcional futuro no runtime (quantizar no tintedFrame). PS1 em 48 px perde o rosto/braços; não vale como padrão.
- Usuário tem Blender 5.2 no PC (repo lab.blender.org adicionado) mas sem Remote Control; seguimos com bpy 5.1 na nuvem.
- Pedido do usuário: "um tradutor de jogos e um dublador de jogos" (interpretado como localização + dublagem/voz). FEITO lote 1: core/commentary/voiceCast.js (2 locutores play/color, prosódia por tom/prioridade, melhor voz do idioma, sem backlog, testes), core/i18n/{i18n,strings}.js (pt-BR fonte; en-US/es-ES com fallback chave a chave), painel de narração traduzido e voz segue `commentary.lang` (pack.$lang). Smoke 33/33.
- Lote 2 FEITO: packs de narração en-US (nfl/nhl/mlb `commentary.en.js`, herdam prioridade/tom do pt-BR), core/commentary/packs.js (registry sport+locale, fallback pt-BR), jogos usam commentaryPack(sport, getLocale()), seletor de idioma no shell (#suLang; vale a partir da próxima partida), tests/commentary_locales.test.mjs. Voz segue commentary.lang.
- Lote 2b (narração ampla/dinâmica) FEITO: 1ª citação do jogador = nome completo, depois sobrenome (engine introNames); $story (marcos: 2º gol/hat trick/2º HR/3 hits/Nº strikeouts/2º TD...) pt+en nos 3 packs; bug corrigido: variantes condicionais deixavam o tipo mudo (retry com todas); modo da voz Resumida/Normal/Completa (minPriority 3/2/1); core/commentary/pronounce.js (respelling só p/ voz: termos pt-BR confiáveis; NOMES = lista inicial NÃO verificada de ouvido; override por localStorage.asu_pron). PRÓXIMO narração: color commentary entre jogadas (tempo ocioso), apelidos/números, estatísticas acumuladas no placar, rivalidade/contexto de carreira (placar da temporada) — usar dados do modo carreira.
- (antigo, já feito acima) lote 2 tradutor: traduzir packs de narração NFL/NHL/MLB para en-US (pack.$lang='en-US', registry por locale) + seletor de idioma no shell; PRÓXIMO: extrair strings da UI dos jogos (botões/painéis/menus) para strings.js, depois es-ES (narração + UI), depois career/. Lote 3 dublador: preferências de voz (escolher play/color), teste de voz, pausas/entonação por esporte, "frases-bordão" por tom.
## Pendências antigas
apagar atlas órfãos (git rm assets/sprites/{football,hockey,baseball}_{color,mask}.png — bloqueado pela verificação de segurança, só o usuário); PENALTY no motor; túnel MLB/NFL; career_ui.mjs; importar .glb numa engine.
## Ferramentas
python3 -m http.server 8300 (nohup); Playwright /opt/node-tools + Chromium /opt/pw-browsers/chromium-1243/chrome-linux64/chrome; bpy pip 5.1 em venv (docs/anim/BLENDER_NOTES.md); testes: npm test (136+44), tests/browser/smoke.mjs e career.mjs com servidor em 8300.
