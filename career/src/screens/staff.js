// Staff (hire / fire), Training (weekly focus plans) and Development (player career) screens.
import { A, S, esc, nn, fix, money, meter, chip, registerScreen, pageTitle, panel, on, onChange, openModal, confirmBox, toast, touch, refresh, posTag, roleTxt, curveSvg, sortRows, thead, isNum, clamp } from '../core.js';
import { playerLink } from './team.js';

const GROUP_LABEL = { offense: 'Ataque', defense: 'Defesa', special: 'Times especiais', dev: 'Desenvolvimento', med: 'Medicina / físico', scout: 'Scouting' };
const GROUP_FX = { offense: 'sobe o rating tático (ataque)', defense: 'sobe o rating tático (defesa)', special: 'times especiais / bases', dev: 'multiplica a evolução dos jogadores', med: 'reduz lesões e acelera a recuperação', scout: 'revela ratings mais rápido (fog of war)' };
const stars = r => `<span class="bar2" style="width:90px;display:inline-block;vertical-align:middle" title="nota ${r}"><i style="width:${clamp(r, 0, 100)}%"></i></span> <b>${esc(r)}</b>`;

// ---------- staff ----------
registerScreen('staff', {
  title: 'Comissão técnica',
  render(el) {
    const c = S.c, v = A.getStaffView(c), ed = v.editable, fx = v.effects;
    const mk = S.ui.staffRole || 'all';
    const market = (mk === 'all' ? v.market : v.market.filter(m => m.role === mk));
    const mcols = [{ k: 'rating', label: 'Nota', num: true }, { k: 'name', label: 'Nome' }, { k: 'label', label: 'Função' }, { k: 'age', label: 'Idade', num: true }, { k: 'pot', label: 'Pot.', num: true }, { k: 'sal', label: 'Salário', num: true }, { k: 'trait', label: 'Perfil' }, { k: 'x', label: '', sort: false }];
    el.innerHTML = `${pageTitle('Comissão técnica')}
    ${!ed ? '<div class="notice">Jogadores não contratam comissão técnica. Veja os efeitos do staff do seu clube na tela Time.</div>' : ''}
    <div class="dash-grid"><div class="stack">
      ${panel('Orçamento da comissão', `<div class="bar2 ${v.budget.spent > v.budget.total ? 'bad' : ''}" role="img" aria-label="gasto ${money(v.budget.spent)} de ${money(v.budget.total)}"><i style="width:${clamp((v.budget.spent / Math.max(0.01, v.budget.total)) * 100, 0, 100).toFixed(0)}%"></i></div><small class="muted">${money(v.budget.spent)} de ${money(v.budget.total)} por ano · o orçamento é definido pela diretoria (dono).</small>`)}
      ${panel('Funções', v.roles.map(r => `<div style="margin-bottom:10px"><div class="panel-h" style="margin-bottom:2px"><b style="text-transform:none;letter-spacing:0">${esc(r.label)}</b><span class="muted small">${chip(GROUP_LABEL[r.group] || r.group)} ${r.hired.length}/${r.slots}</span></div>
        ${r.hired.map(m => `<div class="staff-row"><span><b>${esc(m.name)}</b> <small class="muted">${esc(m.age)} anos · ${esc(m.trait)}</small></span><span>${stars(m.rating)}</span><span class="muted small">${money(m.sal)} · ${esc(m.yrs)}a</span>${ed ? `<button class="danger" data-act="staff-fire" data-id="${esc(m.id)}">Demitir</button>` : '<span></span>'}</div>`).join('') || '<p class="muted small">Vaga em aberto.</p>'}
        ${ed && r.open > 0 ? `<button data-act="staff-pick" data-role="${esc(r.key)}">+ Contratar (${r.open} vaga${r.open > 1 ? 's' : ''})</button>` : ''}</div>`).join(''))}
      ${panel('Mercado de comissão', `<div class="team-tools"><label class="fld">Função<select data-chg="staff-filter"><option value="all">Todas</option>${v.roles.map(r => `<option value="${esc(r.key)}" ${mk === r.key ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label></div><div class="scroll"><table class="tbl"><caption class="sr-only">Candidatos</caption>${thead('staffMkt', mcols, { k: 'rating', dir: -1 })}${sortRows('staffMkt', market, mcols, { k: 'rating', dir: -1 }).map(m => `<tr><td class="num"><b>${esc(m.rating)}</b></td><td>${esc(m.name)}</td><td>${esc(m.label)}</td><td class="num">${esc(m.age)}</td><td class="num">${esc(m.pot)}</td><td class="num">${money(m.sal)}</td><td>${esc(m.trait)}</td><td>${ed ? `<button data-act="staff-hire" data-id="${esc(m.id)}">Contratar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Sem candidatos.</td></tr>'}</table></div>`)}
    </div><div class="stack">
      ${fx ? panel('Efeitos no time', `${meter('Desenvolvimento', (fx.dev - 0.8) / 0.4 * 100, { sub: `evolução ×${fx.dev}` })}${meter('Medicina', (fx.med + 0.7) / 1.4 * 100, { sub: `lesões ×${fx.injuryMult} · recuperação +${fx.healBonus}` })}${meter('Ataque', (fx.offense + 1) / 2 * 100, { sub: `${fx.offense > 0 ? '+' : ''}${fx.offense}` })}${meter('Defesa', (fx.defense + 1) / 2 * 100, { sub: `${fx.defense > 0 ? '+' : ''}${fx.defense}` })}${meter('Times especiais', (fx.special + 1) / 2 * 100)}${meter('Scouting', fx.scout)}${meter('Treinador principal', fx.head)}`) : ''}
      ${v.headCoach ? panel('Treinador principal (contratado pela diretoria)', `<dl class="dl"><dt>Nome</dt><dd>${esc(v.headCoach.name)}</dd><dt>Nota</dt><dd>${esc(v.headCoach.rating)}</dd><dt>Reputação</dt><dd>${esc(v.headCoach.rep)}</dd><dt>Confiança</dt><dd>${esc(Math.round(v.headCoach.trust))}</dd></dl>`) : ''}
      ${panel('O que cada grupo faz', `<ul class="reasons">${Object.entries(GROUP_FX).map(([g, t]) => `<li><b>${esc(GROUP_LABEL[g])}</b>: ${esc(t)}</li>`).join('')}</ul>`)}
    </div></div>`;
  },
});
onChange('staff-filter', el => { S.ui.staffRole = el.value; refresh(); });
on('staff-fire', async el => {
  const m = A.getStaffView(S.c).roles.flatMap(r => r.hired).find(x => x.id === el.dataset.id); if (!m) return;
  if (!await confirmBox('Demitir membro da comissão', `Demitir ${m.name} (${m.label}, nota ${m.rating})? ${m.yrs > 1 ? `Há multa rescisória de ~${money(m.sal * (m.yrs - 1) * 0.5)}.` : ''}`, { ok: 'Demitir', danger: true })) return;
  const r = A.fireStaff(S.spec, S.c, m.id); toast(r.text, !r.ok); if (r.ok) touch(); refresh();
});
on('staff-pick', el => { S.ui.staffRole = el.dataset.role; refresh(); document.querySelector('[data-chg="staff-filter"]')?.scrollIntoView({ block: 'center' }); });
on('staff-hire', async el => {
  const v = A.getStaffView(S.c), cand = v.market.find(m => m.id === el.dataset.id); if (!cand) return;
  const role = v.roles.find(r => r.key === cand.role), full = role.open <= 0;
  await openModal({ title: `Contratar ${cand.name}`, html: `<dl class="dl"><dt>Função</dt><dd>${esc(cand.label)}</dd><dt>Nota / potencial</dt><dd>${esc(cand.rating)} / ${esc(cand.pot)}</dd><dt>Idade e perfil</dt><dd>${esc(cand.age)} anos · ${esc(cand.trait)}</dd><dt>Salário</dt><dd>${money(cand.sal)}/ano</dd><dt>Orçamento livre</dt><dd>${money(v.budget.total - v.budget.spent)}</dd></dl>
    <div class="form-grid"><label>Anos<input type="number" name="yrs" min="1" max="5" value="2"></label>${full ? `<label>Substituir<select name="rep">${role.hired.map(h => `<option value="${esc(h.id)}">${esc(h.name)} (nota ${esc(h.rating)})</option>`).join('')}</select></label>` : ''}</div>${full ? '<p class="muted small">As vagas dessa função estão cheias: escolha quem será substituído (a multa rescisória é paga).</p>' : ''}`,
    actions: [{ key: 'no', label: 'Cancelar' }, { key: 'ok', label: 'Contratar', primary: true, handler: ctx => { const f = ctx.form(); const r = A.hireStaff(S.spec, S.c, cand.id, { yrs: f.yrs || 2, replaceId: full ? f.rep : undefined }); if (!r.ok) { ctx.msg(r.text, 'bad'); return false; } toast(r.text); touch(); } }] });
  refresh();
});

// ---------- training (coach / GM) ----------
registerScreen('training', {
  title: 'Treino',
  render(el) {
    const c = S.c, v = A.getTrainingView(c);
    if (v.role === 'PLAYER') { el.innerHTML = '<div class="panel empty">Use a tela Desenvolvimento.</div>'; return; }
    const p = v.plan, rows = v.developing;
    el.innerHTML = `${pageTitle('Plano de treino semanal')}<div class="dash-grid"><div class="stack">
      ${panel('Foco do treino', `<div class="foci" role="radiogroup" aria-label="Foco">${v.foci.map(f => { const d = A.FOCI[f.key]; return `<button class="pick ${p.focus === f.key ? 'on' : ''}" data-act="train-focus" data-k="${esc(f.key)}" role="radio" aria-checked="${p.focus === f.key}"><b>${esc(f.label)}</b><small>XP ×${d.xp} · carga ${d.load > 0 ? '+' : ''}${d.load} · entrosamento +${d.fam}${d.youth ? ` · jovens ×${d.youth}` : ''}</small></button>`; }).join('')}</div>
        <div class="slider-row" style="margin-top:10px"><label for="intens">Intensidade</label><input id="intens" type="range" min="0.5" max="2" step="0.1" value="${esc(p.intensity)}" data-chg="train-int"><span class="v" id="intV">${esc(fix(p.intensity, 1))}</span></div>
        <label class="chk"><input type="checkbox" data-chg="train-prep" ${p.matchPrep ? 'checked' : ''}> Preparação específica para o próximo adversário (dobra o ganho de entrosamento)</label>
        <h4 class="sec-h">Por grupo de posição</h4><div class="form-grid">${v.groups.map(g => `<label>${esc(g)}<select data-chg="train-grp" data-g="${esc(g)}">${v.groupModes.map(m => `<option value="${m}" ${(p.groups[g] || 'normal') === m ? 'selected' : ''}>${{ normal: 'Normal', extra: 'Extra (+35% XP, mais carga)', light: 'Leve (−30% XP)' }[m]}</option>`).join('')}</select></label>`).join('')}</div>
        <p class="muted small">Todo dia o treino gera XP; o XP vira OVR (limitado por potencial, idade e curva). A carga alta aumenta o risco de lesão; treino tático constrói entrosamento (e trocar táticas o derruba).</p>`)}
      ${panel('Jovens em desenvolvimento', `<table class="tbl"><tr><th>Atleta</th><th>Pos</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th class="num">XP</th><th>Curva</th></tr>${rows.map(r => `<tr><td>${playerLink(r.id, r.n)}</td><td>${posTag(r.pos)}</td><td class="num">${esc(r.age)}</td><td class="num">${esc(r.ovr)}</td><td class="num">${esc(r.pot)}</td><td class="num">${esc(r.xp)}</td><td>${esc(nn(r.curve))}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Ninguém com margem de crescimento.</td></tr>'}</table>`)}
    </div><div class="stack">
      ${panel('Estado da equipe', `${meter('Carga de treino', v.load, { cls: v.load > 70 ? 'low' : v.load > 55 ? 'mid' : 'good', sub: 'acima de 55 aumenta lesões' })}${meter('Entrosamento tático', v.familiarity)}<p class="muted small">Multiplicador de lesões pelo treino: <b>×${esc(v.injuryMult)}</b></p>`)}
      ${panel('Evolução recente', `<div class="news-list">${v.gains.map(g => `<div class="news-it"><small>${esc(g.s)} · dia ${esc(g.d)}</small> ${playerLink(g.id, g.n)} sobe para <b>${esc(g.ovr)}</b></div>`).join('') || '<p class="muted">Sem evolução ainda: o XP leva algumas semanas.</p>'}</div>`)}
    </div></div>`;
  },
});
const setPlan = patch => { const r = A.setTraining(S.spec, S.c, patch); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); };
on('train-focus', el => setPlan({ focus: el.dataset.k }));
onChange('train-int', el => setPlan({ intensity: +el.value }));
onChange('train-prep', el => setPlan({ matchPrep: el.checked }));
onChange('train-grp', el => setPlan({ groups: { [el.dataset.g]: el.value } }));

// ---------- development (player career) ----------
registerScreen('development', {
  title: 'Desenvolvimento',
  render(el) {
    const c = S.c, spec = S.spec, tv = A.getTrainingView(c), P = A.getProfileView(c), me = c.players[c.me.id], pr = P.projection;
    const focusSet = tv.attrs;
    el.innerHTML = `${pageTitle('Desenvolvimento do jogador')}<div class="dash-grid"><div class="stack">
      ${panel('Atributos e XP', `<div class="stat-grid" style="margin-bottom:8px"><div class="stat"><small>XP disponível</small><b>${esc(tv.xp)}</b></div><div class="stat"><small>OVR</small><b>${esc(tv.ovr)}</b></div><div class="stat"><small>Potencial</small><b>${esc(tv.pot)}</b></div></div>
        <table class="tbl"><tr><th>Atributo</th><th style="width:38%">Valor</th><th class="num">Custo de +1</th><th></th></tr>${tv.attrs.map(a => { const cost = isNum(a.value) ? A.attrCost(a.value, me.pot) : null; return `<tr><td>${esc(a.label)}${tv.training.focus === a.key ? ' <span class="chip ok">foco</span>' : ''}</td><td><span class="bar2" style="display:inline-block;width:70%;vertical-align:middle"><i style="width:${clamp(a.value ?? 0, 0, 100)}%"></i></span> <b>${esc(nn(a.value))}</b></td><td class="num">${esc(nn(cost))} XP</td><td><button data-act="spend-xp" data-k="${esc(a.key)}" ${cost != null && tv.xp >= cost ? '' : 'disabled'} title="Gasta XP para subir o atributo">+1</button></td></tr>`; }).join('')}</table><p class="muted small">XP vem do treino diário e dos jogos (mais com boa atuação). Atributos acima do potencial custam mais.</p>`)}
      ${panel('Treino individual', `<div class="form-grid"><label>Foco (atributo)<select data-chg="ptrain-focus">${focusSet.map(a => `<option value="${esc(a.key)}" ${tv.training.focus === a.key ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label></div><div class="slider-row" style="margin-top:8px"><label for="pint">Intensidade</label><input id="pint" type="range" min="0.5" max="2" step="0.1" value="${esc(tv.training.intensity)}" data-chg="ptrain-int"><span class="v">${esc(fix(tv.training.intensity, 1))}</span></div><p class="muted small">Intensidade alta rende mais XP; o preparo dos companheiros e do clube multiplica o ganho.</p>`)}
    </div><div class="stack">
      ${panel('Estado atual', `${meter('Forma', (tv.form + 10) / 20 * 100, { show: `${tv.form > 0 ? '+' : ''}${fix(tv.form, 1)}`, sub: 'de −10 a +10' })}${meter('Confiança', tv.confidence)}${meter('Confiança do técnico', P.relationships.coachTrust, { sub: 'CoachTrust' })}${meter('Companheiros', P.relationships.teammates, { sub: 'TeammateRelationship' })}${meter('Diretoria', P.relationships.management, { sub: 'ManagementTrust' })}${meter('Torcida', P.relationships.fans, { sub: 'FanSupport' })}<dl class="dl" style="margin-top:6px"><dt>Papel no time</dt><dd>${esc(roleTxt(me.role))}</dd><dt>Idade</dt><dd>${esc(me.age)}</dd><dt>Curva</dt><dd>${esc(P.player.curve.label)}</dd></dl>`)}
      ${panel(`Curva de crescimento: ${esc(P.player.curve.label)}`, `${curveSvg(pr.points, { w: 400, h: 150, label: P.player.curve.label })}<p class="muted small">OVR esperado por idade (média de simulações). Pico previsto: <b>${esc(fix(pr.peakOvr, 0))}</b> aos ${esc(pr.peakAge)} anos. Lesões e regressão aleatória podem desviar da média.</p>`)}
    </div></div>`;
  },
});
on('spend-xp', el => { const r = A.spendXP(S.spec, S.c, el.dataset.k, 1); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); });
onChange('ptrain-focus', el => { const r = A.setPlayerTraining(S.spec, S.c, { focus: el.value }); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); });
onChange('ptrain-int', el => { const r = A.setPlayerTraining(S.spec, S.c, { intensity: +el.value }); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); });
