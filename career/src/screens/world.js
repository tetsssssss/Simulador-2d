// News (CareerNewsEngine feed + career events), History, Career Profile (coach / GM / player).
import { A, S, $, esc, nn, fix, money, meter, chip, crest, tcolor, tname, myAbbr, registerScreen, pageTitle, panel, on, onChange, onInput, openModal, confirmBox, toast, touch, refresh, posTag, sortRows, thead, curveSvg, avSlot, mountAvatars, roleTxt, isNum, clamp, openEvents, go, KIT } from '../core.js';
import { newsItems, objectivesHtml, relationMeters } from './dashboard.js';
import { openAvatarEditor } from '../../../core/ui/avatarEditor.js';

// ======================= NEWS =======================
const KINDS = ['RESULT', 'INJURY', 'TRADE', 'SIGNING', 'CONTRACT', 'MILESTONE', 'STANDINGS', 'RUMOR', 'FIRING_WATCH', 'AWARD', 'DRAFT', 'COACH', 'EVENT', 'FINANCE', 'PLAYER', 'LEAGUE'];
const KIND_PT = { RESULT: 'Resultados', INJURY: 'Lesões', TRADE: 'Trocas', SIGNING: 'Contratações', CONTRACT: 'Contratos', MILESTONE: 'Marcas', STANDINGS: 'Tabela', RUMOR: 'Rumores', FIRING_WATCH: 'Cadeira quente', AWARD: 'Prêmios', DRAFT: 'Draft', COACH: 'Comando', EVENT: 'Eventos', FINANCE: 'Finanças', PLAYER: 'Jogador', LEAGUE: 'Liga' };
const nf = () => (S.ui.news ||= { kinds: [], team: '', minImp: 1, q: '' });
registerScreen('news', {
  title: 'Notícias',
  render(el) {
    const c = S.c, f = nf(), team = f.team === '__me' ? myAbbr() : f.team;
    const v = A.getNewsView(c, { n: 200, team: team || undefined, kinds: f.kinds.length ? f.kinds : undefined, minImp: f.minImp });
    const q = f.q.trim().toLowerCase(), items = q ? v.items.filter(i => `${i.h} ${i.b}`.toLowerCase().includes(q)) : v.items;
    el.innerHTML = `${pageTitle('Notícias & eventos', `<span class="chip blue">${items.length} notícias</span>`)}<div class="dash-grid"><div class="stack">
      ${panel('Filtros', `<div class="chips" role="group" aria-label="Tipos de notícia">${KINDS.map(k => `<button data-act="news-kind" data-k="${k}" aria-pressed="${f.kinds.includes(k)}" class="${f.kinds.includes(k) ? 'on' : ''}">${esc(KIND_PT[k])}</button>`).join('')}${f.kinds.length ? '<button class="ghost" data-act="news-kind" data-k="">Limpar</button>' : ''}</div>
        <div class="team-tools" style="margin-top:8px"><label class="fld">Time<select data-chg="news-team"><option value="">Todos</option>${myAbbr() ? '<option value="__me" ' + (f.team === '__me' ? 'selected' : '') + '>Meu time</option>' : ''}${c.teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `<option value="${esc(t.abbr)}" ${f.team === t.abbr ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="fld">Importância<select data-chg="news-imp">${[[1, 'Todas'], [2, '2+'], [3, '3+ (relevantes)'], [4, '4+ (grandes)'], [5, 'Só as maiores']].map(([n, l]) => `<option value="${n}" ${f.minImp === n ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="fld">Buscar<input type="search" value="${esc(f.q)}" data-inp="news-q" data-fid="newsq" placeholder="texto"></label></div>`)}
      ${panel('Feed', newsItems(items, 120))}
    </div><div class="stack">
      ${panel(`Eventos da carreira (${v.events.open.length})`, v.events.open.length ? `${v.events.open.map(e => `<div class="alert event"><span class="grow"><b>${esc(e.title)}</b><br><small class="muted">${esc(e.text)}</small></span></div>`).join('')}<button class="primary" data-act="open-events">Decidir agora</button>` : '<p class="muted">Nenhum evento pendente. Eventos nascem de situações reais: pedidos de troca, renovações, lesões, prêmios, ofertas de emprego…</p>')}
      ${panel('Decisões recentes', `<div class="news-list">${v.events.recent.map(e => `<div class="news-it"><h4>${esc(e.title)}</h4><p>${esc(e.choices.find(x => x.key === e.chosen)?.label || e.chosen)} → ${esc(e.result || 'registrado')}</p><small>${esc(e.season)}</small></div>`).join('') || '<p class="muted">Nenhuma decisão ainda.</p>'}</div>`)}
    </div></div>`;
  },
});
on('news-kind', el => { const f = nf(), k = el.dataset.k; if (!k) f.kinds = []; else f.kinds = f.kinds.includes(k) ? f.kinds.filter(x => x !== k) : [...f.kinds, k]; refresh(); });
onChange('news-team', el => { nf().team = el.value; refresh(); });
onChange('news-imp', el => { nf().minImp = +el.value; refresh(); });
onInput('news-q', el => { nf().q = el.value; refresh(); });

// ======================= HISTORY =======================
registerScreen('history', {
  title: 'Histórico',
  render(el) {
    const c = S.c, spec = S.spec, h = A.getHistoryView(c), tv = A.getTransactionsView(c, { n: 40 });
    const seasons = h.seasons.slice().reverse();
    const rec = s => (s.w != null ? `${s.w}-${s.l}${s.otl ? '-' + s.otl : s.t ? '-' + s.t : ''}${s.finish ? ` (${s.finish}º)` : ''}` : esc(s.line || s.stage || ''));
    const trail = h.repTrail.length > 1 ? curveSvg(h.repTrail.map(r => ({ age: r.s, ovr: r.rep })), { w: 300, h: 110, label: 'Reputação por temporada', color: '#4d9bff' }) : '';
    el.innerHTML = `${pageTitle('Histórico', `<span class="chip ok">${esc(h.titles)} título(s)</span>`)}<div class="dash-grid"><div class="stack">
      ${panel('Temporadas', `<table class="tbl"><caption class="sr-only">Temporadas</caption><tr><th>Temporada</th><th>Time</th><th>Campanha</th><th>Campeão</th><th>Metas</th></tr>${seasons.map(s => `<tr><td>${esc(s.s)}</td><td>${esc(nn(s.team, ''))}</td><td>${rec(s)}</td><td>${esc(nn(s.champion, ''))}</td><td>${(s.goals || []).map(g => (g.status === 'done' ? '✅' : '❌')).join('')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma temporada concluída ainda.</td></tr>'}</table>`)}
      ${h.players ? panel('Minhas estatísticas por temporada', `<table class="tbl"><tr><th>Temporada</th><th>Time / nível</th><th>Linha</th></tr>${h.players.slice().reverse().map(r => `<tr><td>${esc(r.s)}</td><td>${esc(nn(r.t, ''))}</td><td>${esc(spec.formatLine ? spec.formatLine(r) : '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sem temporadas fechadas.</td></tr>'}</table>`) : ''}
      ${panel('Prêmios', `<div class="news-list">${h.awards.slice().reverse().map(a => `<div class="news-it k-AWARD"><small>${esc(a.s)}</small> <b>${esc(a.award)}</b> ${esc(a.name)} <small class="muted">${esc(nn(a.team, ''))}</small></div>`).join('') || '<p class="muted">Nenhum prêmio ainda.</p>'}</div>`)}
    </div><div class="stack">
      ${trail ? panel('Reputação ao longo do tempo', trail) : ''}
      ${h.coach.length ? panel('Histórico no comando', `<table class="tbl"><tr><th>Ano</th><th>Time</th><th>Campanha</th><th class="num">Rep.</th></tr>${h.coach.slice().reverse().map(x => `<tr><td>${esc(x.s)}</td><td>${esc(nn(x.team, ''))}</td><td>${x.fired ? `<b class="bad">demitido</b>` : `${esc(nn(x.w, ''))}-${esc(nn(x.l, ''))}${x.champ ? ' 🏆' : x.made ? ' (playoffs)' : ''}`}</td><td class="num">${esc(nn(x.rep, ''))}</td></tr>`).join('')}</table>`) : ''}
      ${panel('Transações recentes da liga', `<div class="news-list">${tv.recent.map(t => `<div class="news-it"><small>${esc(t.s)} · ${esc(t.kind)}</small><p>${esc(t.text)}</p></div>`).join('') || '<p class="muted">Sem transações.</p>'}</div>`)}
    </div></div>`;
  },
});

// ======================= PROFILE =======================
registerScreen('profile', {
  title: 'Perfil da carreira',
  render(el, d) { if (S.c.role === 'PLAYER') return playerProfile(el, d); return coachProfile(el, d); },
});
function coachProfile(el, d) {
  const c = S.c, spec = S.spec, v = A.getProfileView(c), sec = v.security, m = v.market, who = c.role === 'GM' ? 'dirigente' : 'técnico';
  const offers = v.offers || [];
  const jobCard = o => `<div class="alert info"><span class="grow">${crest(o.team, tcolor(o.team), 'sm')} <b>${esc(o.name)}</b> — ${money(o.sal)}/ano × ${esc(o.yrs)} anos<br><small class="muted">${esc(o.why)}</small></span><button class="primary" data-act="job-accept" data-team="${esc(o.team)}">Aceitar</button></div>`;
  const teamsTbl = m.teams.slice().sort((a, b) => b.prestige - a.prestige);
  el.innerHTML = `${pageTitle(`Perfil · ${ { COACH: 'Técnico', GM: 'Dirigente' }[c.role] }`, `<span class="chip blue">Reputação ${esc(v.rep)}</span>`)}
  ${c.fired ? `<div class="notice bad" role="alert"><div><b>Você foi demitido.</b> ${esc(nn(v.firedReason, ''))}<br>Escolha uma proposta ou candidate-se a uma vaga para continuar a carreira.</div></div>` : ''}
  <div class="dash-grid"><div class="stack">
    ${c.fired || offers.length ? panel('Propostas de emprego', offers.map(jobCard).join('') || '<p class="muted">Nenhuma proposta no momento. Candidate-se a uma vaga abaixo.</p>') : ''}
    ${panel('Contrato com o clube', v.contract ? `<dl class="dl"><dt>Clube</dt><dd>${crest(v.contract.team, tcolor(v.contract.team), 'sm')} ${esc(tname(v.contract.team))}</dd><dt>Salário</dt><dd>${money(v.contract.sal)}/ano</dd><dt>Anos restantes</dt><dd>${esc(v.contract.yrs)}</dd><dt>Desde</dt><dd>${esc(v.contract.since)}</dd></dl><button data-act="coach-negotiate">Negociar contrato</button>` : '<p class="muted">Sem contrato (desempregado).</p>')}
    ${sec ? panel('Segurança no cargo', `<div class="chips">${chip(sec.label, sec.level === 'SAFE' ? 'ok' : sec.level === 'WARM' ? 'warn' : 'bad')}</div>${meter('Índice', sec.score)}<dl class="dl"><dt>Confiança da diretoria</dt><dd>${esc(sec.trust)}</dd><dt>Objetivos no caminho</dt><dd>${esc(sec.onTrack)}%</dd><dt>Confiança do elenco</dt><dd>${esc(sec.squad)}</dd><dt>Reputação</dt><dd>${esc(sec.rep)}</dd></dl><p class="muted small">A diretoria demite no fim da temporada (ou no meio, se o time desabar) combinando confiança, resultados e metas. Dificuldade maior = menos paciência.</p>`) : ''}
    ${panel('Mandato do dono', v.board.mandate ? `<p><b>${esc(v.board.mandate.text)}</b></p><p class="muted small">De ${esc(v.board.mandate.from)} até ${esc(v.board.mandate.by)} · ${v.board.mandate.met ? '<b class="good">cumprido</b>' : 'em andamento'}${v.board.mandate.missed ? ` · prorrogado ${esc(v.board.mandate.missed)}×` : ''}</p>` : '<p class="muted">—</p>')}
    ${panel('Objetivos da temporada', objectivesHtml(d.objectives))}
    ${panel('Vagas abertas na liga', m.vacancies.length ? `<table class="tbl"><tr><th>Clube</th><th class="num">Prestígio</th><th class="num">Rep. mínima</th><th>Salário</th><th></th></tr>${m.vacancies.map(j => `<tr><td>${crest(j.team, tcolor(j.team), 'sm')} ${esc(j.name)}</td><td class="num">${esc(j.prestige)}</td><td class="num">${esc(j.minRep)}</td><td>${money(j.pay)}</td><td><button data-act="job-apply" data-team="${esc(j.team)}" ${j.canApply ? '' : 'disabled'} title="${j.canApply ? 'Candidatar-se' : 'Reputação insuficiente'}">Candidatar-se</button></td></tr>`).join('')}</table>` : '<p class="muted">Nenhuma vaga aberta agora. Vagas surgem quando clubes demitem seus comandantes (fim de temporada).</p>')}
  </div><div class="stack">
    ${panel('Relacionamentos', relationMeters(c, d))}
    ${panel('Reputação', meter('Reputação como ' + who, v.rep, { sub: `${esc(v.seasons)} temporada(s) no comando` }))}
    ${panel('Técnicos e dirigentes da liga', `<div class="scroll"><table class="tbl"><tr><th>Clube</th><th class="num">Prest.</th><th>Técnico</th><th class="num">Nota</th><th class="num">Conf.</th></tr>${teamsTbl.map(t => `<tr class="${t.abbr === c.userTeam ? 'me' : ''}"><td>${esc(t.abbr)}${t.vacant ? ' <span class="chip warn">vago</span>' : ''}</td><td class="num">${esc(t.prestige)}</td><td>${esc(t.coach)}</td><td class="num">${esc(t.coachRating)}</td><td class="num">${esc(t.trust)}</td></tr>`).join('')}</table></div>`)}
  </div></div>`;
}
on('job-accept', async el => {
  const o = A.getProfileView(S.c).offers.find(x => x.team === el.dataset.team); if (!o) return;
  if (!await confirmBox('Aceitar proposta', `Assumir ${o.name} por ${money(o.sal)}/ano × ${o.yrs} anos? Você deixa o cargo atual.`, { ok: 'Aceitar' })) return;
  const r = A.acceptJobOffer(S.spec, S.c, o.team); toast(r.text, !r.ok); if (r.ok) { touch(); S.screen = 'dashboard'; go('dashboard'); } refresh();
});
on('job-apply', async el => {
  const r = A.applyForJob(S.spec, S.c, el.dataset.team); toast(r.text, !r.ok); if (!r.ok) return refresh();
  if (await confirmBox('Candidatura aceita', `${r.text} Assumir o cargo agora por ${money(r.offer.sal)}/ano × ${r.offer.yrs}?`, { ok: 'Assumir' })) { const a = A.acceptJobOffer(S.spec, S.c, el.dataset.team); toast(a.text, !a.ok); if (a.ok) touch(); }
  refresh();
});
on('coach-negotiate', async () => {
  const k = S.c.x.coach.contract;
  await openModal({ title: 'Negociar contrato com a diretoria', html: `<p class="muted small">Atual: ${money(k.sal)} × ${esc(k.yrs)} ano(s). A diretoria aceita até ~8% acima do valor da sua reputação; sem confiança (<35) ela nem conversa.</p><div class="form-grid"><label>Salário anual (M)<input type="number" step="0.05" name="sal" value="${esc(k.sal)}" data-autofocus></label><label>Anos<input type="number" name="yrs" min="1" max="5" value="${esc(Math.max(2, k.yrs))}"></label></div>`, actions: [{ key: 'no', label: 'Cancelar' }, { key: 'ok', label: 'Propor', primary: true, handler: ctx => { const f = ctx.form(), r = A.negotiateContract(S.spec, S.c, { sal: f.sal, yrs: f.yrs }); if (!r.ok) { ctx.msg(r.text + (r.counter ? ` Contraproposta: ${money(r.counter.sal)} × ${r.counter.yrs}.` : ''), 'bad'); return false; } toast(r.text); touch(); } }] });
  refresh();
});

function playerProfile(el, d) {
  const c = S.c, spec = S.spec, P = A.getProfileView(c), p = P.player, me = c.players[c.me.id], pr = P.projection, ap = p.appearance;
  const photo = p.photoUrl && /^(https?:\/\/|data:image\/)/i.test(p.photoUrl) ? `<img class="photo-prev" src="${esc(p.photoUrl)}" alt="Foto de ${esc(p.name)}" referrerpolicy="no-referrer">` : '';
  el.innerHTML = `${pageTitle('Perfil do jogador')}<div class="dash-grid"><div class="stack">
    ${panel('Atleta', `<div class="player-head">${avSlot(me.id, { size: 90, num: p.jersey })}<div><h3 style="font-size:18px;margin:0">${esc(p.name)}</h3><div class="chips" style="margin-top:4px">${posTag(p.pos)}${chip(`#${nn(p.jersey, '—')}`)}${p.archetype ? chip(p.archetype, 'blue') : ''}${chip(P.stage || '', 'ok')}</div><p class="muted small">${esc(nn(p.age))} anos · ${esc(nn(p.height))} cm · ${esc(nn(p.weight))} kg · ${p.team && p.team !== 'AMATEUR' && p.team !== 'DRAFT' && p.team !== 'FA' ? esc(tname(p.team)) : esc({ AMATEUR: 'amador', DRAFT: 'aguardando o draft', FA: 'agente livre' }[p.team] || '—')}</p></div>${photo || `<div style="text-align:right"><div class="big">${esc(nn(p.ovr))}</div><small class="muted">POT ${esc(nn(p.pot))}</small></div>`}</div><div class="chips" style="margin-top:8px"><button data-act="edit-appearance">🎨 Editar aparência</button></div>${ap && Object.keys(ap).length ? `<p class="muted small">Aparência salva na carreira: ${Object.entries(ap).map(([k, x]) => `${k} ${x}`).join(' · ')}</p>` : ''}`)}
    ${panel('Atributos', P.attrs.map(a => `<div class="meter ${a.value >= 70 ? 'good' : a.value >= 55 ? 'mid' : 'low'}"><span class="mlbl">${esc(a.label)} <small class="muted">${Math.round(a.weight * 100)}%</small></span><span class="mbar"><i style="width:${clamp(a.value ?? 0, 0, 100)}%"></i></span><span class="mval">${esc(nn(a.value))}</span></div>`).join(''), '<button class="ghost" data-act="goto" data-s="development">Evoluir</button>')}
    ${panel('Road to Pro', `<div class="timeline">${P.pathway.steps.map(s => `<span class="${s.state === 'current' ? 'on' : ''}">${s.state === 'done' ? '✓ ' : ''}${esc(s.label)}</span>`).join('')}</div><p class="muted small" style="margin-top:6px">Caminho escolhido: <b>${esc(P.pathway.label)}</b>${P.stock ? ` · projeção de draft: <b>${esc(P.stock.label)}</b>` : ''}</p>`)}
    ${panel('Estatísticas', P.hist.length || me.ps?.gp ? `<table class="tbl"><tr><th>Temporada</th><th>Time / nível</th><th>Linha</th></tr>${me.ps?.gp ? `<tr class="me"><td>${esc(c.season)}</td><td>${esc(nn(me.t, ''))} (atual)</td><td>${esc(spec.formatLine(me.ps))}</td></tr>` : ''}${P.hist.slice().reverse().map(r => `<tr><td>${esc(r.s)}</td><td>${esc(nn(r.t, ''))}</td><td>${esc(spec.formatLine(r))}</td></tr>`).join('')}</table>` : '<p class="muted">Sem jogos ainda.</p>')}
  </div><div class="stack">
    ${panel('Relacionamentos', relationMeters(c, d) + (P.relationships.log.length ? `<h4 class="sec-h">Motivos recentes</h4><div class="news-list">${P.relationships.log.map(l => `<div class="news-it"><small>${esc(l.s)} · ${esc({ coachTrust: 'Técnico', teammates: 'Companheiros', management: 'Diretoria', fans: 'Torcida' }[l.key] || l.key)}</small> <b class="${l.delta > 0 ? 'good' : 'bad'}">${l.delta > 0 ? '+' : ''}${esc(l.delta)}</b> ${esc(l.why)}</div>`).join('')}</div>` : ''))}
    ${panel(`Curva: ${esc(p.curve.label)}`, `${curveSvg(pr.points, { w: 380, h: 140, label: p.curve.label })}<p class="muted small">Pico previsto de OVR ${esc(fix(pr.peakOvr, 0))} aos ${esc(pr.peakAge)} anos.</p>`)}
    ${panel('Objetivos', objectivesHtml(d.objectives))}
    ${panel('Diário', `<div class="news-list">${P.log.map(l => `<div class="news-it">${esc(l)}</div>`).join('') || '<p class="muted">—</p>'}</div>`)}
  </div></div>`;
}
on('edit-appearance', () => {
  const c = S.c, me = c.players[c.me.id];
  S.avClose = openAvatarEditor({ sport: c.sport, id: me.id, name: me.n, number: me.num, pos: me.pos, color: tcolor(myAbbr()), color2: '#ffffff', kit: KIT[c.sport], onSave: ap => { me.appearance = { ...ap }; touch(); toast('Aparência salva na carreira.'); refresh(); } });
});
