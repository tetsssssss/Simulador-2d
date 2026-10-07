// Contracts, Transactions (trade builder with trade AI, free agency, waivers / options / 40-man / practice squad / tag), Scouting, Draft.
import { A, S, $, esc, nn, fix, money, meter, chip, crest, tcolor, tname, myAbbr, registerScreen, pageTitle, panel, on, onChange, onInput, openModal, confirmBox, toast, touch, refresh, ovrBadge, potTxt, posTag, stTxt, sortRows, thead, fogNote, issuesHtml, subTabs, tabOf, isNum, clamp, roleTxt, go, withBusy } from '../core.js';
import { moveButtons, negotiateModal, sportMoves } from '../actions.js';
import { playerLink } from './team.js';

// ======================= CONTRACTS =======================
const CCOLS = [{ k: 'n', label: 'Atleta' }, { k: 'pos', label: 'Pos' }, { k: 'age', label: 'Idade', num: true }, { k: 'ovr', label: 'OVR', num: true }, { k: 'sal', label: 'Salário', num: true }, { k: 'yrs', label: 'Anos', num: true }, { k: 'contractKind', label: 'Tipo' }, { k: 'market', label: 'Mercado', num: true }, { k: 'surplus', label: 'Valor líq.', num: true }, { k: 'x', label: '', sort: false }];
registerScreen('contracts', {
  title: 'Contratos',
  render(el) {
    const c = S.c, spec = S.spec;
    if (c.role === 'PLAYER') return playerContract(el);
    const v = A.getContractsView(c), over = v.payroll > v.cap;
    const pctPay = clamp((v.payroll / v.cap) * 100, 0, 100), budPct = clamp((v.budget / v.cap) * 100, 0, 100);
    const rows = sortRows('contracts', v.rows, CCOLS, { k: 'sal', dir: -1 });
    const exp = v.expiring;
    el.innerHTML = `${pageTitle(c.sport === 'mlb' ? 'Contratos & CBT' : 'Contratos & teto')}
    ${issuesHtml(v.legality)}
    <div class="dash-grid"><div class="stack">
      ${panel(v.capKind === 'hard' ? 'Teto salarial (rígido)' : 'Folha e imposto de luxo (CBT)', `<div class="bar2 ${over ? 'bad' : ''}" role="img" aria-label="folha ${money(v.payroll)} de ${money(v.cap)}"><i style="width:${pctPay.toFixed(0)}%"></i><b style="left:${budPct.toFixed(0)}%" title="orçamento de folha aprovado: ${money(v.budget)}"></b></div>
        <div class="stat-grid" style="margin-top:8px"><div class="stat"><small>Folha</small><b>${money(v.payroll)}</b></div><div class="stat"><small>${v.capKind === 'hard' ? 'Teto' : 'CBT'}</small><b>${money(v.cap)}</b></div><div class="stat"><small>${v.capKind === 'hard' ? 'Espaço' : 'Margem'}</small><b class="${v.capSpace < 0 ? 'bad' : 'good'}">${money(v.capSpace)}</b></div><div class="stat"><small>Orçamento (dono)</small><b>${money(v.budget)}</b></div>${v.luxuryTax ? `<div class="stat"><small>Imposto de luxo</small><b class="bad">${money(v.luxuryTax)}</b></div>` : ''}</div>
        ${v.overBudget ? '<div class="alert warn" style="margin-top:8px">⚠ Folha acima do orçamento aprovado pelo dono: a diretoria cobra.</div>' : ''}
        <p class="muted small">${c.sport === 'mlb' ? 'Pré-arbitragem (<3 anos de serviço) recebe o mínimo; arbitragem de 3 a 5 anos aumenta o salário; free agency com 6+. Acima do CBT há imposto de 20% sobre o excedente.' : c.sport === 'nhl' ? 'ELC de 3 anos para draftados; RFA (<27 anos e <7 de serviço) pode ser retido; UFA livre. Teto rígido.' : 'Contratos de novato de 4–5 anos; teto rígido; dispensar gera custo morto; 1 franchise tag por offseason.'}</p>`)}
      ${exp.length ? panel(`Contratos vencendo (${exp.length})`, `<table class="tbl">${exp.map(p => `<tr><td>${playerLink(p.id, p.n)}</td><td>${posTag(p.pos)}</td><td class="num">${ovrBadge(p.ovr)}</td><td>${money(p.sal)} × ${esc(nn(p.yrs))}${p.expiring ? ' <b class="bad">vence</b>' : ''}</td><td class="acts"><button data-act="negotiate" data-id="${esc(p.id)}">Renovar</button>${moveButtons({ ...c.players[p.id], id: p.id })}</td></tr>`).join('')}</table>`) : ''}
      ${panel('Folha salarial', `<div class="scroll tall"><table class="tbl"><caption class="sr-only">Contratos do elenco</caption>${thead('contracts', CCOLS, { k: 'sal', dir: -1 })}${rows.map(p => `<tr class="${p.inj ? 'inj' : ''}"><td>${playerLink(p.id, p.n)}${p.expiring ? ' <b class="bad" title="vence">!</b>' : ''}</td><td>${posTag(p.pos)}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${ovrBadge(p.ovr)}</td><td class="num">${money(p.sal)}</td><td class="num">${esc(nn(p.yrs))}</td><td>${esc(nn(p.contractKind, ''))}${c.sport === 'mlb' && p.svc != null ? ` <small class="muted">${esc(p.svc)}a serv.</small>` : ''}</td><td class="num">${money(p.market)}</td><td class="num ${p.surplus < 0 ? 'bad' : 'good'}">${p.surplus > 0 ? '+' : ''}${fix(p.surplus, 1)}</td><td class="acts"><button data-act="negotiate" data-id="${esc(p.id)}">Renovar</button><button class="danger" data-act="release" data-id="${esc(p.id)}">Dispensar</button></td></tr>`).join('')}</table></div>`)}
    </div><div class="stack">
      ${panel('Como funciona', `<ul class="reasons"><li><b>Valor líquido</b> = (valor de mercado − salário) × anos (até 4): positivo é contrato bom.</li><li>Renovar acima do pedido garante o aceite; abaixo, o jogador pode recusar.</li><li>${v.capKind === 'hard' ? 'O teto rígido bloqueia contratações e renovações que o estourem.' : 'Não há teto rígido: o CBT só cobra imposto.'}</li><li>Dispensar paga parte do contrato restante (custo morto).</li></ul>`)}
    </div></div>`;
  },
});
function playerContract(el) {
  const c = S.c, spec = S.spec, me = c.players[c.me.id], open = me.t === 'FA' || me.expiring, offers = open ? A.playerOffers(spec, c) : [], team = myAbbr();
  S.ui.offers = offers;
  const canAsk = !!team && !['AMATEUR', 'DRAFT', 'FA'].includes(me.t);
  el.innerHTML = `${pageTitle('Contrato & agente')}<div class="dash-grid"><div class="stack">
    ${panel('Contrato atual', me.c ? `<dl class="dl"><dt>Clube</dt><dd>${crest(team, tcolor(team), 'sm')} ${esc(tname(team))}</dd><dt>Salário</dt><dd>${money(me.c.sal)}/ano × ${esc(me.c.yrs)} ano(s)</dd><dt>Tipo</dt><dd>${esc(nn(me.c.kind))}</dd>${me.expiring ? '<dt>Situação</dt><dd class="bad">vence nesta offseason</dd>' : ''}</dl>` : `<p class="muted">${me.t === 'AMATEUR' ? 'Você é amador: o contrato profissional vem após o draft (ou a assinatura internacional).' : me.t === 'DRAFT' ? 'Aguardando o draft.' : me.t === 'FA' ? 'Agente livre: veja as propostas ao lado.' : 'Sem contrato profissional.'}</p>`)}
    ${panel(open ? 'Propostas de contrato' : 'Propostas', open ? `<table class="tbl"><tr><th>Clube</th><th>Proposta</th><th>Papel previsto</th><th>Momento</th><th></th></tr>${offers.map((o, i) => `<tr><td>${crest(o.team, tcolor(o.team), 'sm')} ${esc(o.name)}</td><td>${money(o.sal)} × ${esc(o.yrs)}</td><td>${esc(roleTxt(o.role))}</td><td>${esc({ contender: 'favorito', middle: 'meio', rebuild: 'reconstrução' }[o.mode] || '')}</td><td><button class="primary" data-act="accept-offer" data-i="${i}">Assinar</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhuma proposta no momento.</td></tr>'}</table>` : '<p class="muted">Propostas aparecem quando o contrato vence ou você é agente livre. Decisões de renovação chegam como eventos da carreira.</p>')}
  </div><div class="stack">
    ${panel('Agente & pedidos', `${meter('Agente', c.me.agent ?? 60, { sub: 'influencia as propostas' })}${meter('Confiança da diretoria', c.x.prel.management, { sub: 'ManagementTrust' })}${meter('Confiança do técnico', c.x.prel.coachTrust, { sub: 'CoachTrust' })}
      <div class="chips" style="margin-top:8px"><button data-act="ask-time" ${canAsk ? '' : 'disabled'}>Pedir mais tempo de jogo</button><button class="danger" data-act="ask-trade" ${canAsk ? '' : 'disabled'}>Pedir troca</button><button data-act="open-events">Eventos pendentes (${c.x.events.pending.length})</button></div><p class="muted small">Pedidos gastam confiança; bom desempenho e treino a recuperam. Recusar contrato ou pedir troca à toa azeda a relação com a diretoria.</p>`)}
  </div></div>`;
}
on('accept-offer', async el => {
  const o = S.ui.offers?.[+el.dataset.i]; if (!o) return;
  if (!await confirmBox('Assinar contrato', `Assinar com ${o.name}: ${money(o.sal)} × ${o.yrs} ano(s)?`, { ok: 'Assinar' })) return;
  A.acceptPlayerOffer(S.spec, S.c, o); toast(`Contrato assinado com ${o.name}.`); touch(); refresh();
});
on('ask-time', () => { const r = A.requestPlayingTime(S.spec, S.c); toast(r.text || 'Pedido feito.', r.ok === false); touch(); refresh(); });
on('ask-trade', async () => { if (!await confirmBox('Pedir troca', 'Pedir troca pode desgastar a relação com técnico e diretoria. Continuar?', { ok: 'Pedir troca', danger: true })) return; const r = A.requestTrade(S.spec, S.c); toast(r.text || 'Pedido feito.', r.ok === false); touch(); refresh(); });

// ======================= TRANSACTIONS =======================
const tr = () => (S.ui.trade ||= { to: null, giveP: [], giveK: [], getP: [], getK: [], res: null });
const pickName = k => { const [y, r, o] = String(k).split('-'); return `${y} R${r}${o ? ` (${o})` : ''}`; };
const asTxt = (side, c) => [...(side.players || []).map(id => c.players[id]?.n || id), ...(side.picks || []).map(pickName)].join(', ') || '—';
registerScreen('transactions', {
  title: 'Transações',
  render(el) {
    const c = S.c, spec = S.spec, tv = A.getTransactionsView(c, { n: 60 }), tab = tabOf('trans', 'trade');
    const tabs = [['trade', 'Trocas'], ['market', 'Free agency'], ['moves', c.sport === 'nfl' ? 'Elenco / practice squad / tag' : c.sport === 'nhl' ? 'Waivers / AHL / prospectos' : 'Opções / 40-man / DFA'], ['block', 'Bloco de trocas'], ['picks', 'Escolhas'], ['log', 'Histórico']];
    const body = { trade: tradeTab, market: marketTab, moves: movesTab, block: blockTab, picks: picksTab, log: logTab }[tab](tv);
    el.innerHTML = `${pageTitle('Transações', `<span class="chip ${tv.window.open ? 'ok' : 'bad'}">${tv.window.open ? 'Janela de trocas aberta' : 'Janela de trocas fechada'}</span>`)}${subTabs('trans', tabs, tab)}${body}`;
  },
});
function tradeTab(tv) {
  const c = S.c, spec = S.spec, me = myAbbr(), t = tr();
  const others = c.teams.filter(x => x.abbr !== me).sort((a, b) => a.name.localeCompare(b.name));
  if (!t.to || t.to === me || !others.some(x => x.abbr === t.to)) t.to = others[0].abbr;
  const mine = A.getRosterView(c, me).groups.flatMap(g => g.players).filter(p => p.st !== 'PROSPECT'), theirs = A.getRosterView(c, t.to).groups.flatMap(g => g.players);
  const myPicks = tv.picks?.mine || [], theirPicks = A.teamPicks(spec, c, t.to, { years: 2 });
  const tm = c.teams.find(x => x.abbr === t.to);
  const cb = (side, kind, id, on) => `<input type="checkbox" data-chg="trade-tog" data-side="${side}" data-kind="${kind}" data-id="${esc(id)}" ${on ? 'checked' : ''} aria-label="Selecionar">`;
  const pTable = (list, side, sel) => `<div class="scroll"><table class="tbl"><tr><th></th><th>Atleta</th><th>Pos</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th>Contrato</th></tr>${list.map(p => `<tr class="${sel.includes(p.id) ? 'me' : ''}"><td>${cb(side, 'p', p.id, sel.includes(p.id))}</td><td>${playerLink(p.id, p.n)}${p.inj ? ' 🩹' : ''}</td><td>${posTag(p.pos)}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${ovrBadge(p.ovr, p.ovrRange)}</td><td class="num">${potTxt(p.pot, p.potRange)}</td><td>${p.sal != null ? `${money(p.sal)}×${esc(nn(p.yrs))}` : ''}</td></tr>`).join('')}</table></div>`;
  const kTable = (list, side, sel) => `<div class="chips" style="margin-top:6px">${list.map(k => `<label class="chip ${sel.includes(k.key) ? 'on' : ''}" style="cursor:pointer"><input type="checkbox" data-chg="trade-tog" data-side="${side}" data-kind="k" data-id="${esc(k.key)}" ${sel.includes(k.key) ? 'checked' : ''} style="margin-right:4px"> ${esc(pickName(k.key))}${k.projectedOverall ? ` · ~#${esc(k.projectedOverall)}` : ''}</label>`).join('') || '<span class="muted small">Sem escolhas.</span>'}</div>`;
  const r = t.res;
  const nSel = t.giveP.length + t.giveK.length + t.getP.length + t.getK.length;
  return `<div class="stack"><div class="panel"><div class="panel-h"><b>Central de trocas</b><label class="fld" style="grid-auto-flow:column;align-items:center;gap:6px">Time<select data-chg="trade-team" aria-label="Time para negociar">${others.map(x => `<option value="${esc(x.abbr)}" ${x.abbr === t.to ? 'selected' : ''}>${esc(x.name)} (${esc({ contender: 'favorito', middle: 'meio', rebuild: 'reconstrução' }[x.mode] || x.mode)})</option>`).join('')}</select></label></div>
    <div class="trade-cols"><div><b>Você envia</b> <small class="muted">${t.giveP.length + t.giveK.length} item(ns)</small>${pTable(mine, 'give', t.giveP)}<div class="sec-sub" style="margin-top:6px">Suas escolhas</div>${kTable(myPicks, 'give', t.giveK)}</div>
      <div><b>Você recebe</b> <small class="muted">${t.getP.length + t.getK.length} item(ns) · ${crest(t.to, tm?.color, 'sm')} ${esc(tm?.name)}</small>${pTable(theirs, 'get', t.getP)}<div class="sec-sub" style="margin-top:6px">Escolhas deles</div>${kTable(theirPicks, 'get', t.getK)}</div></div>
    <div class="chips" style="margin-top:10px"><button class="primary" id="tradeEval" data-act="trade-eval" ${nSel ? '' : 'disabled'}>Avaliar proposta</button><button data-act="trade-clear" ${nSel ? '' : 'disabled'}>Limpar</button></div></div>
    ${r ? tradeResult(r) : '<p class="muted small">Monte a troca e peça a avaliação: a IA pondera idade, curva de crescimento, produção, potencial vs. momento do time, escassez da posição, contrato, lesão, necessidade e escolhas.</p>'}</div>`;
}
function tradeResult(r) {
  const c = S.c, res = r.res, cls = res.accept ? 'ok' : res.counterOffer ? 'counter' : 'no', title = res.accept ? 'A IA aceita a troca' : res.counterOffer ? 'A IA propõe uma contraproposta' : res.legal === false ? 'Troca inválida' : 'A IA recusa';
  return `<div class="verdict ${cls}" role="status"><div><b class="t">${res.accept ? '✅' : res.counterOffer ? '🔄' : '⛔'} ${esc(title)}</b>${isNum(res.valueIn) ? `<div class="muted small">Eles recebem <b>${fix(res.valueIn, 1)}</b> · enviam <b>${fix(res.valueOut, 1)}</b> · exigem <b>${fix(res.need, 1)}</b> (margem da dificuldade incluída)</div>` : ''}<ul class="reasons">${(res.reasons || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    ${res.counterOffer ? `<div class="sec-sub">Contraproposta: você envia <b>${esc(asTxt(res.counterOffer.give, c))}</b> e recebe <b>${esc(asTxt(res.counterOffer.get, c))}</b>.</div>` : ''}</div><span class="grow"></span>
    ${res.accept ? '<button class="primary" id="tradeDo" data-act="trade-do">Executar troca</button>' : ''}${res.counterOffer ? '<button class="primary" id="tradeCounter" data-act="trade-counter">Usar contraproposta</button>' : ''}</div>`;
}
const toIds = (t) => ({ give: { players: [...t.giveP], picks: [...t.giveK] }, get: { players: [...t.getP], picks: [...t.getK] } });
onChange('trade-team', el => { const t = tr(); t.to = el.value; t.getP = []; t.getK = []; t.res = null; refresh(); });
onChange('trade-tog', el => {
  const t = tr(), key = el.dataset.side + (el.dataset.kind === 'p' ? 'P' : 'K'), list = t[key], id = el.dataset.id, i = list.indexOf(id);
  if (el.checked && i < 0) list.push(id); else if (!el.checked && i >= 0) list.splice(i, 1);
  t.res = null; refresh();
});
on('trade-clear', () => { const t = tr(); Object.assign(t, { giveP: [], giveK: [], getP: [], getK: [], res: null }); refresh(); });
on('trade-eval', () => { const t = tr(); const offer = { from: myAbbr(), to: t.to, ...toIds(t) }; t.res = { res: A.evaluateOffer(S.spec, S.c, offer), offer }; refresh(); });
on('trade-counter', () => { const t = tr(), co = t.res.res.counterOffer; t.giveP = [...co.give.players]; t.giveK = [...co.give.picks]; t.getP = [...co.get.players]; t.getK = [...co.get.picks]; const offer = { from: myAbbr(), to: t.to, ...toIds(t) }; t.res = { res: A.evaluateOffer(S.spec, S.c, offer), offer }; refresh(); });
on('trade-do', async () => {
  const t = tr(), offer = t.res.offer;
  const r = A.makeOffer(S.spec, S.c, offer); toast(r.text, !r.ok);
  if (r.ok) { Object.assign(t, { giveP: [], giveK: [], getP: [], getK: [], res: null }); touch(); } else t.res = { res: A.evaluateOffer(S.spec, S.c, offer), offer };
  refresh();
});

// ---- free agency ----
const FCOLS = [{ k: 'n', label: 'Atleta' }, { k: 'pos', label: 'Pos' }, { k: 'age', label: 'Idade', num: true }, { k: 'ovr', label: 'OVR', num: true }, { k: 'pot', label: 'POT', num: true }, { k: 'ask', label: 'Pedido', num: true, val: p => p.ask?.sal }, { k: 'x', label: '', sort: false }];
function marketTab() {
  const c = S.c, spec = S.spec, v = A.getContractsView(c), q = (S.ui.filter.fa || '').toLowerCase(), g = S.ui.filter.faG || 'all';
  const groups = [...new Set(v.freeAgents.map(p => p.group))];
  let list = v.freeAgents.filter(p => (g === 'all' || p.group === g) && (!q || p.n.toLowerCase().includes(q)));
  list = sortRows('fa', list, FCOLS, { k: 'ovr', dir: -1 });
  const faPeriod = c.phase === 'OFFSEASON' && c.off === 'FREE_AGENCY';
  return `<div class="panel"><div class="panel-h"><b>Agentes livres</b><small class="muted">${v.freeAgents.length} melhores${faPeriod ? ' · período de free agency' : ''}</small></div><div class="team-tools"><label class="fld">Buscar<input type="search" value="${esc(S.ui.filter.fa || '')}" data-inp="fa-q" data-fid="faq" placeholder="nome"></label><label class="fld">Posição<select data-chg="fa-g"><option value="all">Todas</option>${groups.map(x => `<option ${x === g ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
    <div class="scroll tall"><table class="tbl"><caption class="sr-only">Agentes livres</caption>${thead('fa', FCOLS, { k: 'ovr', dir: -1 })}${list.map(p => `<tr><td>${playerLink(p.id, p.n)}${p.fict ? '<span class="fict">fictício</span>' : ''}</td><td>${posTag(p.pos)}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${ovrBadge(p.ovr, p.ovrRange)} ${fogNote(p)}</td><td class="num">${potTxt(p.pot, p.potRange)}</td><td class="num">${money(p.ask.sal)} × ${esc(p.ask.yrs)}</td><td class="acts"><button data-act="negotiate" data-kind="sign" data-id="${esc(p.id)}" data-sal="${esc(p.ask.sal)}" data-yrs="${esc(p.ask.yrs)}">Oferecer</button>${c.sport === 'nfl' ? `<button data-act="move" data-m="signPracticeSquad" data-id="${esc(p.id)}" title="Assina para o practice squad (mínimo)">PS</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhum agente livre com esse filtro.</td></tr>'}</table></div></div>`;
}
onInput('fa-q', el => { S.ui.filter.fa = el.value; refresh(); });
onChange('fa-g', el => { S.ui.filter.faG = el.value; refresh(); });

// ---- roster moves ----
function movesTab() {
  const c = S.c, spec = S.spec, v = A.getRosterView(c, myAbbr());
  const list = v.groups.flatMap(g => g.players);
  const proto = c.sport === 'nhl' ? list.filter(p => p.st === 'MIN') : [];
  return `<div class="stack">${issuesHtml(v.legality)}<div class="panel"><div class="panel-h"><b>${c.sport === 'nfl' ? 'Practice squad, tag e elenco ativo' : c.sport === 'nhl' ? 'AHL, waivers e call-ups' : 'Opções, 40-man, DFA e call-ups'}</b></div><div class="scroll tall"><table class="tbl"><caption class="sr-only">Movimentações do elenco</caption><tr><th>Atleta</th><th>Pos</th><th class="num">OVR</th><th>Status</th><th>Contrato</th>${c.sport === 'mlb' ? '<th class="num">Opções</th><th>40-man</th>' : ''}<th></th></tr>${list.map(p => `<tr class="${p.inj ? 'inj' : ''}"><td>${playerLink(p.id, p.n)}</td><td>${posTag(p.pos)}</td><td class="num">${ovrBadge(p.ovr)}</td><td>${stTxt(p)}</td><td>${p.sal != null ? `${money(p.sal)} × ${esc(nn(p.yrs))}` : '—'}${p.expiring ? ' <b class="bad">vence</b>' : ''}</td>${c.sport === 'mlb' ? `<td class="num">${esc(nn(p.opt))}</td><td>${p.on40 ? '✓' : ''}</td>` : ''}<td class="acts">${moveButtons({ ...c.players[p.id], id: p.id })}</td></tr>`).join('')}</table></div></div>
    ${proto.length ? panel('Pipeline de prospectos (NHL)', `<table class="tbl"><tr><th>Prospecto</th><th>Pos</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th>Nível</th></tr>${proto.map(p => `<tr><td>${playerLink(p.id, p.n)}</td><td>${posTag(p.pos)}</td><td class="num">${esc(p.age)}</td><td class="num">${ovrBadge(p.ovr)}</td><td class="num">${esc(p.pot)}</td><td><select data-chg="assign-prospect" data-id="${esc(p.id)}" aria-label="Nível">${['JUNIOR', 'AHL', 'EUROPE'].map(l => `<option ${l === p.lvl ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}</table>`) : ''}</div>`;
}
onChange('assign-prospect', el => { const r = A.assignProspect(S.spec, S.c, el.dataset.id, el.value); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); });

// ---- trade block ----
function blockTab(tv) {
  const c = S.c, b = tv.block, myRows = A.getRosterView(c, myAbbr()).groups.flatMap(g => g.players).filter(p => p.st !== 'PROSPECT');
  const onBlock = new Set(b.user.map(p => p.id));
  return `<div class="grid2"><div class="stack">${panel('Meu bloco de trocas', `<p class="sec-sub">Quem você coloca no bloco recebe ofertas que a IA aceitaria.</p><div class="scroll"><table class="tbl">${myRows.map(p => `<tr><td><input type="checkbox" data-chg="block-tog" data-id="${esc(p.id)}" ${onBlock.has(p.id) ? 'checked' : ''} aria-label="No bloco"></td><td>${playerLink(p.id, p.n)}</td><td>${posTag(p.pos)}</td><td class="num">${ovrBadge(p.ovr)}</td></tr>`).join('')}</table></div>`)}
    ${panel('Ofertas recebidas', b.offers.length ? `<table class="tbl">${b.offers.map((o, i) => `<tr><td>${crest(o.team, tcolor(o.team), 'sm')} <b>${esc(o.team)}</b></td><td>você envia ${esc(asTxt(o.give, c))}<br><small class="muted">recebe ${esc(asTxt(o.get, c))}</small></td><td><button class="primary" data-act="block-accept" data-i="${i}">Aceitar</button></td></tr>`).join('')}</table>` : '<p class="muted">Sem ofertas: coloque jogadores no bloco ou espere o mercado reagir.</p>')}</div>
    ${panel('Jogadores à venda na liga', `<div class="scroll tall"><table class="tbl"><tr><th>Time</th><th>Atleta</th><th>Pos</th><th class="num">Idade</th><th class="num">OVR</th><th>Contrato</th><th>Motivo</th><th></th></tr>${b.league.map(p => `<tr><td>${esc(p.team)}</td><td>${playerLink(p.id, p.name)}</td><td>${posTag(p.pos)}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${esc(nn(p.ovr))}</td><td>${p.sal != null ? `${money(p.sal)}×${esc(nn(p.yrs))}` : ''}</td><td>${esc(p.reason)}</td><td><button data-act="block-target" data-id="${esc(p.id)}" data-team="${esc(p.team)}">Negociar</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">Ninguém no bloco agora.</td></tr>'}</table></div>`)}</div>`;
}
onChange('block-tog', el => { const ids = A.getTransactionsView(S.c).block.user.map(p => p.id).filter(x => x !== el.dataset.id); if (el.checked) ids.push(el.dataset.id); A.setTradeBlock(S.spec, S.c, ids); touch(); refresh(); });
on('block-accept', el => { const o = A.getTransactionsView(S.c).block.offers[+el.dataset.i]; if (!o) return; const r = A.makeOffer(S.spec, S.c, { from: o.from, to: o.to, give: o.give, get: o.get }); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); });
on('block-target', el => { const t = tr(); Object.assign(t, { to: el.dataset.team, giveP: [], giveK: [], getP: [el.dataset.id], getK: [], res: null }); S.ui.tab.trans = 'trade'; refresh(); });

function picksTab(tv) {
  const p = tv.picks; if (!p) return '<div class="panel empty">Sem clube: sem escolhas.</div>';
  return `<div class="panel"><div class="panel-h"><b>Minhas escolhas de draft</b><small class="muted">próximo draft: ${esc(p.draftYear)}</small></div><table class="tbl"><tr><th>Ano</th><th>Rodada</th><th>Original</th><th class="num">Posição projetada</th></tr>${p.mine.map(k => `<tr><td>${esc(k.y)}</td><td>${esc(k.r)}ª</td><td>${esc(k.o)}${k.o !== k.t ? ' <small class="muted">(adquirida)</small>' : ''}</td><td class="num">#${esc(k.projectedOverall)}</td></tr>`).join('')}</table></div>`;
}
function logTab(tv) { return `<div class="panel"><div class="panel-h"><b>Movimentações recentes da liga</b></div><div class="news-list">${tv.recent.map(t => `<div class="news-it"><small>${esc(t.s)} · ${esc(t.kind)}${t.ai ? ' · IA' : ''}</small><p>${esc(t.text)}</p></div>`).join('') || '<p class="muted">Sem transações ainda.</p>'}</div></div>`; }

// ======================= SCOUTING =======================
const SCOLS = [{ k: 'rank', label: '#', num: true, val: p => p.rank }, { k: 'n', label: 'Prospecto' }, { k: 'pos', label: 'Pos' }, { k: 'age', label: 'Idade', num: true }, { k: 'ovr', label: 'OVR (est.)', num: true }, { k: 'pot', label: 'POT (est.)', num: true }, { k: 'know', label: 'Conhec.', num: true }];
registerScreen('scouting', {
  title: 'Scouting',
  render(el) {
    const c = S.c, v = A.getScoutingView(c), ed = v.editable;
    const roles = A.getStaffView(c).roles, rl = k => roles.find(r => r.key === k)?.label || k;
    const rows = sortRows('scout', v.prospects.map((p, i) => ({ ...p, rank: i + 1 })), SCOLS, { k: 'rank', dir: 1 });
    el.innerHTML = `${pageTitle('Scouting', `<span class="chip blue">Rede de scouting nível ${esc(nn(v.facility))}</span>`)}<div class="dash-grid"><div class="stack">
      ${panel('Prospectos do draft (ratings com fog of war)', `<div class="scroll tall"><table class="tbl"><caption class="sr-only">Prospectos</caption>${thead('scout', SCOLS, { k: 'rank', dir: 1 })}${rows.map(p => `<tr><td class="num">${esc(p.rank)}</td><td>${playerLink(p.id, p.n)}${p.fict ? '<span class="fict">fictício</span>' : ''}</td><td>${posTag(p.pos)}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${ovrBadge(p.ovr, p.ovrRange)}</td><td class="num">${potTxt(p.pot, p.potRange)}</td><td class="num"><span class="bar2" style="display:inline-block;width:50px;vertical-align:middle"><i style="width:${clamp(p.know, 0, 100)}%"></i></span> ${esc(p.know)}%</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Sem prospectos.</td></tr>'}</table></div><p class="muted small">Quanto mais conhecimento, menor a margem de erro. ${v.known} jogadores já são conhecidos com precisão (≥95%).</p>`)}
      ${v.intl ? panel('Prospectos internacionais (MLB)', `${meter('Orçamento internacional', v.intlBudget.pool ? ((v.intlBudget.pool - v.intlBudget.spent) / v.intlBudget.pool) * 100 : 0, { sub: `${money(v.intlBudget.pool - v.intlBudget.spent)} livres de ${money(v.intlBudget.pool)} · período ${v.intlBudget.open ? 'ABERTO' : 'fechado'}` })}<div class="scroll"><table class="tbl"><tr><th>Prospecto</th><th>Pos</th><th>País</th><th class="num">Idade</th><th class="num">OVR</th><th class="num">POT</th><th class="num">Bônus</th><th></th></tr>${v.intl.map(p => `<tr><td>${playerLink(p.id, p.n)}</td><td>${posTag(p.pos)}</td><td>${esc(nn(p.country))}</td><td class="num">${esc(p.age)}</td><td class="num">${ovrBadge(p.ovr, p.ovrRange)}</td><td class="num">${potTxt(p.pot, p.potRange)}</td><td class="num">${money(p.ask)}</td><td>${ed ? `<button data-act="intl-sign" data-id="${esc(p.id)}" data-ask="${esc(p.ask)}">Assinar</button>` : ''}</td></tr>`).join('')}</table></div>`) : ''}
    </div><div class="stack">
      ${panel('Scouts e atribuições', ed ? v.scouts.map(s => `<div class="staff-row" style="grid-template-columns:1fr 150px"><span><b>${esc(s.name)}</b> <small class="muted">${esc(rl(s.role))} · nota ${esc(s.rating)}</small></span><select data-chg="scout-assign" data-id="${esc(s.id)}" aria-label="Alvo do scout ${esc(s.name)}"><option value="">Automático</option>${v.targets.map(t => `<option value="${esc(t.key)}" ${s.target === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>`).join('') || '<p class="muted">Sem scouts: contrate na Comissão técnica.</p>' : '<p class="muted">Apenas técnico e dirigente comandam o scouting.</p>')}
      ${panel('Como funciona', '<ul class="reasons"><li>Cada scout aprofunda o conhecimento de até 6 jogadores por dia no alvo atribuído.</li><li>Nota do scout e nível da rede de scouting aceleram o processo.</li><li>Seus jogadores são sempre exatos; os de outros clubes e prospectos são estimativas.</li></ul>')}
    </div></div>`;
  },
});
onChange('scout-assign', el => { const r = A.assignScout(S.spec, S.c, el.dataset.id, el.value || null); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); });
on('intl-sign', async el => {
  const v = A.getScoutingView(S.c), ask = +el.dataset.ask, left = v.intlBudget.pool - v.intlBudget.spent;
  await openModal({ title: 'Assinatura internacional', html: `<p>Bônus mínimo aceito: <b>${money(ask * 0.9)}</b> (pedido ${money(ask)}). Orçamento livre: <b>${money(left)}</b>.</p><div class="form-grid"><label>Bônus (milhões)<input type="number" name="b" step="0.05" min="0" value="${esc(ask)}" data-autofocus></label></div>`, actions: [{ key: 'no', label: 'Cancelar' }, { key: 'ok', label: 'Assinar', primary: true, handler: ctx => { const r = A.signInternational(S.spec, S.c, el.dataset.id, +ctx.form().b); if (!r.ok) { ctx.msg(r.text, 'bad'); return false; } toast(r.text); touch(); } }] });
  refresh();
});

// ======================= DRAFT =======================
const WKEY = () => `asu_career_watch_${S.c.id}`;
const watch = () => { try { return new Set(JSON.parse(localStorage.getItem(WKEY()) || '[]')); } catch { return new Set(); } };
const saveWatch = w => { try { localStorage.setItem(WKEY(), JSON.stringify([...w])); } catch { /* private mode */ } };
const DCOLS = [{ k: 'rank', label: '#', num: true }, { k: 'w', label: '★', sort: false }, { k: 'n', label: 'Prospecto' }, { k: 'pos', label: 'Pos' }, { k: 'age', label: 'Idade', num: true }, { k: 'ovr', label: 'OVR (est.)', num: true }, { k: 'pot', label: 'POT (est.)', num: true }, { k: 'know', label: 'Conhec.', num: true }, { k: 'x', label: '', sort: false }];
registerScreen('draft', {
  title: 'Draft',
  render(el) {
    const c = S.c, v = A.getDraftView(c), d = c.draft, w = watch(), onlyW = !!S.ui.filter.draftW;
    const list = sortRows('draft', v.board.filter(p => !onlyW || w.has(p.id)), DCOLS, { k: 'rank', dir: 1 });
    const clock = v.onTheClock, total = d?.picks?.length || 0;
    const gm = c.role === 'GM';
    el.innerHTML = `${pageTitle(`Draft ${v.year}`, `<span class="chip ${v.active ? 'warn' : v.done ? 'ok' : ''}">${v.active ? 'EM ANDAMENTO' : v.done ? 'Encerrado' : 'Aguardando a offseason'}</span>`)}
    ${c.role === 'PLAYER' ? playerPath(v) : ''}
    ${v.active ? `<div class="panel"><div class="panel-h"><b>No relógio</b></div><div class="game-card">${crest(clock.team, tcolor(clock.team), 'lg')}<div><b style="font-size:18px">${esc(tname(clock.team))}</b><div class="muted small">${esc(clock.round)}ª rodada · escolha ${esc(clock.pick)} · ${esc(clock.overall)}º geral${clock.orig && clock.orig !== clock.team ? ` (via ${esc(clock.orig)})` : ''}</div><div class="bar2" style="margin-top:6px;width:240px"><i style="width:${total ? ((v.cursor / total) * 100).toFixed(0) : 0}%"></i></div><small class="muted">${esc(v.cursor)} de ${esc(total)} escolhas feitas</small></div><div class="stack">${v.userTurn ? '<b class="warn-t">É a sua vez! Escolha na lista.</b>' : gm ? '<button class="primary" data-act="draft-run">Simular até a minha vez</button>' : ''}<button data-act="draft-auto">Auto-draft até o fim</button></div></div></div>` : ''}
    <div class="dash-grid"><div class="stack">${panel('Prancheta do draft', `<div class="team-tools"><label class="chk"><input type="checkbox" data-chg="draft-w" ${onlyW ? 'checked' : ''}> Só favoritos (${w.size})</label></div><div class="scroll tall"><table class="tbl"><caption class="sr-only">Prospectos do draft</caption>${thead('draft', DCOLS, { k: 'rank', dir: 1 })}${list.map(p => `<tr><td class="num">${esc(p.rank)}</td><td><button class="ghost" style="padding:0 5px" data-act="draft-star" data-id="${esc(p.id)}" aria-pressed="${w.has(p.id)}" aria-label="Favorito">${w.has(p.id) ? '★' : '☆'}</button></td><td>${playerLink(p.id, p.n)}${p.mine ? ' <b class="good">você</b>' : ''}${p.fict ? '<span class="fict">fictício</span>' : ''}</td><td>${posTag(p.pos)}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${ovrBadge(p.ovr, p.ovrRange)}</td><td class="num">${potTxt(p.pot, p.potRange)}</td><td class="num">${esc(p.know)}%</td><td>${v.userTurn && gm ? `<button class="primary" data-act="draft-pick" data-id="${esc(p.id)}">Escolher</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Prancheta vazia.</td></tr>'}</table></div><p class="muted small">Ratings com margem de scouting. Os favoritos ficam salvos neste navegador.</p>`)}</div>
    <div class="stack">${panel('Minhas escolhas', v.userPicks.length ? `<table class="tbl"><tr><th>#</th><th>Rd</th><th>Original</th><th>Escolhido</th></tr>${v.userPicks.map(p => `<tr><td class="num">${esc(p.overall)}</td><td>${esc(p.round)}</td><td>${esc(p.orig || p.team)}</td><td>${esc(nn(p.player, '—'))}</td></tr>`).join('')}</table>` : '<p class="muted">As escolhas aparecem quando o draft é montado (fim da temporada).</p>')}
      ${panel('Últimas escolhas', `<table class="tbl">${v.results.slice().reverse().map(r => `<tr><td class="num">${esc(r.overall)}</td><td>${esc(r.team)}</td><td>${esc(nn(r.player))} <small class="muted">${esc(nn(r.pos, ''))}</small></td></tr>`).join('') || '<tr><td class="muted">Draft ainda não começou.</td></tr>'}</table>`)}</div></div>`;
  },
});
function playerPath(v) {
  const c = S.c, spec = S.spec, P = A.getProfileView(c), me = c.players[c.me.id], eligible = me.age >= spec.draft.ageMin;
  return `<div class="panel"><div class="panel-h"><b>Meu caminho até a liga</b></div><div class="timeline">${P.pathway.steps.map(s => `<span class="${s.state === 'current' ? 'on' : ''}">${s.state === 'done' ? '✓ ' : ''}${esc(s.label)}</span>`).join('')}</div>
    <p style="margin-top:8px">${P.stock ? `Projeção de draft: <b>${esc(P.stock.label)}</b> (posição ~${esc(P.stock.rank)}). ` : 'A projeção aparece ao fim da temporada amadora. '}${me.t === 'AMATEUR' ? (c.me.declare ? '<b class="good">Você está declarado para o draft.</b>' : eligible ? '<button data-act="declare">Declarar para o draft</button>' : `Elegível ao draft com ${esc(spec.draft.ageMin)} anos.`) : me.drafted ? `Draftado: ${esc(me.drafted.year)} · ${esc(me.drafted.round)}ª rodada, ${esc(me.drafted.overall)}º (${esc(me.drafted.team)}).` : ''}</p></div>`;
}
on('declare', () => { const r = A.declareForDraft(S.spec, S.c); toast(r.text, r.ok === false); if (r.ok) touch(); refresh(); });
onChange('draft-w', el => { S.ui.filter.draftW = el.checked; refresh(); });
on('draft-star', el => { const w = watch(); w.has(el.dataset.id) ? w.delete(el.dataset.id) : w.add(el.dataset.id); saveWatch(w); refresh(); });
on('draft-run', async () => { await withBusy('Simulando o draft…', async () => { A.runDraft(S.spec, S.c); }); touch(); refresh(); });
on('draft-auto', async () => { await withBusy('Auto-draft…', async () => { A.runDraft(S.spec, S.c, { auto: true }); }); toast('Draft concluído automaticamente.'); touch(); refresh(); });
on('draft-pick', async el => {
  const p = S.c.players[el.dataset.id]; if (!p) return;
  const slot = A.draftPick(S.spec, S.c, el.dataset.id); if (!slot) return toast('Não foi possível escolher agora.', true);
  toast(`Você escolheu ${p.n} (${slot.overall}º geral).`);
  await withBusy('Continuando o draft…', async () => { A.runDraft(S.spec, S.c); }); touch(); refresh();
});
