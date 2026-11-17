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
(nada ainda)
## Pendências antigas
apagar atlas órfãos (git rm assets/sprites/{football,hockey,baseball}_{color,mask}.png — bloqueado pela verificação de segurança, só o usuário); PENALTY no motor; túnel MLB/NFL; career_ui.mjs; importar .glb numa engine.
## Ferramentas
python3 -m http.server 8300 (nohup); Playwright /opt/node-tools + Chromium /opt/pw-browsers/chromium-1243/chrome-linux64/chrome; bpy pip 5.1 em venv (docs/anim/BLENDER_NOTES.md); testes: npm test (136+44), tests/browser/smoke.mjs e career.mjs com servidor em 8300.
