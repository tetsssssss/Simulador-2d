// Team + Roster screens and the player card.
import { A, S, $, esc, nn, fix, money, meter, chip, crest, tcolor, tname, myAbbr, registerScreen, pageTitle, panel, on, onChange, onInput, openModal, toast, touch, refresh, ovrBadge, potTxt, posTag, stTxt, roleTxt, sortRows, thead, fogNote, issuesHtml, subTabs, tabOf, mountAvatars, avSlot, isNum, ensureAvatar } from '../core.js';
import { moveButtons, negotiateModal, releaseConfirm, toggleBlock, sportMoves } from '../actions.js';
import { objectivesHtml } from './dashboard.js';

export const playerLink = (id, name) => `<button class="link" data-act="player" data-id="${esc(id)}">${esc(name)}</button>`;
const abbrs = () => S.c.teams.map(t => t.abbr);
const pickTeam = key => { const a = S.ui[key]; return a && abbrs().includes(a) ? a : myAbbr() || abbrs()[0]; };
const teamSelect = (key, cur) => `<label class="fld" style="grid-auto-flow:column;align-items:center;gap:6px">Ver time<select data-chg="team-pick" data-key="${key}" aria-label="Escolher time">${S.c.teams.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => `<option value="${esc(t.abbr)}" ${t.abbr === cur ? 'selected' : ''}>${esc(t.name)}${t.abbr === myAbbr() ? ' (meu)' : ''}</option>`).join('')}</select></label>`;
onChange('team-pick', el => { S.ui[el.dataset.key] = el.value; refresh(); });

// ---------- player card ----------
export function openPlayerCard(id) {
  const c = S.c, spec = S.spec, p = c.players[id]; if (!p) return;
  const own = p.t === c.userTeam || p.mine, f = own ? null : A.fogged(spec, c, p), me = c.role !== 'PLAYER';
  const ovr = f ? f.ovr : p.ovr, pot = f ? f.pot : p.pot, rel = p.rel && own ? p.rel : null;
  const stat = p.ps?.gp ? spec.formatLine(p.ps) : '';
  const hist = (p.hist || []).slice(-4).reverse().map(h => `<tr><td>${esc(h.s)}</td><td>${esc(h.t)}</td><td>${esc(h.gp != null ? spec.formatLine(h) : h.line || '')}</td></tr>`).join('');
  const cv = A.CURVES[p.cv]?.label;
  const moves = own && c.role !== 'PLAYER' ? sportMoves(p) : [];
  const onBlock = own && c.role !== 'PLAYER' && A.getTransactionsView(c).block.user.some(x => x.id === id);
  const html = `<div class="player-head">${avSlot(id, { size: 76, num: p.num })}<div><div class="chips">${posTag(p.pos)}${chip(`#${nn(p.num, '—')}`)}${p.t && p.t !== 'FA' && p.t !== 'AMATEUR' && p.t !== 'DRAFT' ? chip(p.t, 'blue') : chip(p.t || '—', 'warn')}${p.fict ? chip('fictício', 'warn') : ''}${p.inj ? chip(`🩹 ${p.inj.type} (${p.inj.games})`, 'bad') : ''}${cv && own ? chip(`Curva: ${cv}`) : ''}</div><div class="muted small" style="margin-top:4px">${esc(nn(p.age))} anos${p.arch ? ` · ${esc(p.arch)}` : ''}${p.height ? ` · ${esc(p.height)} cm / ${esc(p.weight)} kg` : ''}${p.drafted ? ` · draft ${esc(p.drafted.year)} R${esc(p.drafted.round)} #${esc(p.drafted.overall)} (${esc(p.drafted.team)})` : ''}</div></div>
    <div style="text-align:right"><div class="big">${f && f.ovrRange && !f.exact ? esc(`${f.ovrRange[0]}–${f.ovrRange[1]}`) : esc(nn(ovr))}</div><small class="muted">POT ${f && f.potRange && !f.exact ? esc(`${f.potRange[0]}–${f.potRange[1]}`) : esc(nn(pot))}</small>${f ? `<div class="est" title="Fog of war">conhecimento ${esc(f.know)}%</div>` : ''}</div></div>
    <div class="grid2"><div><h4 class="sec-h" style="margin-top:4px">Contrato</h4>${p.c ? `<dl class="dl"><dt>Salário</dt><dd>${money(p.c.sal)}/ano × ${esc(p.c.yrs)}</dd><dt>Tipo</dt><dd>${esc(spec.v3.contractKind ? spec.v3.contractKind(spec, p) : p.c.kind)}</dd>${p.expiring ? '<dt>Situação</dt><dd class="bad">vence nesta offseason</dd>' : ''}${p.svc != null ? `<dt>Serviço</dt><dd>${esc(p.svc)} ano(s)</dd>` : ''}${p.opt != null && spec.sport === 'mlb' ? `<dt>Opções</dt><dd>${esc(p.opt)}${p.on40 ? ' · 40-man' : ''}</dd>` : ''}</dl>` : '<p class="muted small">Sem contrato profissional.</p>'}
      <h4 class="sec-h">Situação</h4><dl class="dl"><dt>Status</dt><dd>${stTxt(p)}</dd>${own ? `<dt>Papel</dt><dd>${esc(roleTxt(p.role))}</dd><dt>Forma</dt><dd>${p.fm > 0 ? '+' : ''}${esc(fix(p.fm ?? 0, 1))}</dd><dt>Confiança</dt><dd>${esc(fix(p.conf ?? 55, 0))}</dd><dt>XP</dt><dd>${esc(fix(p.xp ?? 0, 0))}</dd>` : ''}${stat ? `<dt>Temporada</dt><dd>${esc(stat)}</dd>` : ''}</dl></div>
      <div><h4 class="sec-h" style="margin-top:4px">Relação com o clube</h4>${rel ? meter('Confiança', rel.tr) + meter('Respeito', rel.rs) + meter('Moral', rel.mo) + meter('Satisfação', rel.sat) : '<p class="muted small">Relações só são visíveis nos jogadores do seu clube.</p>'}${hist ? `<h4 class="sec-h">Histórico</h4><table class="tbl">${hist}</table>` : ''}</div></div>
    ${own && me ? `<h4 class="sec-h">Ações</h4><div class="chips">${c.role === 'COACH' && p.st !== 'RET' ? `<label class="chk">Papel <select data-chg="p-role" data-id="${esc(id)}"><option value="">—</option>${['S', 'R', 'B'].map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${roleTxt(r)}</option>`).join('')}</select></label>${['praise', 'motivate', 'criticize', 'promise'].map(k => `<button data-act="talk" data-id="${esc(id)}" data-k="${k}">${{ praise: 'Elogiar', motivate: 'Motivar', criticize: 'Cobrar', promise: 'Prometer espaço' }[k]}</button>`).join('')}` : ''}${p.c ? `<button data-act="negotiate" data-id="${esc(id)}">Renovar…</button>` : ''}<button data-act="block" data-id="${esc(id)}">${onBlock ? 'Tirar do bloco' : 'Pôr no bloco de trocas'}</button>${moveButtons(p)}<button class="danger" data-act="release" data-id="${esc(id)}">Dispensar</button></div><div id="talkMsg" class="muted small" role="status"></div>` : ''}`;
  openModal({ title: p.n, html, wide: true, actions: [{ key: 'ok', label: 'Fechar', primary: true }], onOpen: ctx => mountAvatars(ctx.body) });
}
on('player', el => openPlayerCard(el.dataset.id));
onChange('p-role', el => { if (!el.value) return; A.setRole(S.spec, S.c, el.dataset.id, el.value); touch(); toast('Papel definido: afeta satisfação e moral.'); refresh(); });
on('talk', el => { const r = A.talkTo(S.c, el.dataset.id, el.dataset.k); touch(); const m = $('#talkMsg'); if (m) m.textContent = r.text || 'Conversa realizada.'; });

// ---------- roster ----------
const COLS = [
  { k: 'pos', label: 'Pos', val: p => S.spec.positions.indexOf(p.group) * 100 + p.pos.charCodeAt(0) }, { k: 'n', label: 'Atleta' }, { k: 'age', label: 'Idade', num: true }, { k: 'ovr', label: 'OVR', num: true }, { k: 'pot', label: 'POT', num: true },
  { k: 'role', label: 'Papel', val: p => ({ S: 0, R: 1, B: 2 })[p.role] ?? 3 }, { k: 'st', label: 'Status', val: p => (p.inj ? 0 : p.st === 'ACT' ? 1 : 2) }, { k: 'sal', label: 'Contrato', num: true }, { k: 'form', label: 'Forma', num: true }, { k: 'rel', label: 'Relação', sort: false },
];
const relBars = r => (r ? `<span class="rel" title="confiança ${r.trust} · respeito ${r.respect} · moral ${r.morale} · satisfação ${r.satisfaction}">${['trust', 'respect', 'morale', 'satisfaction'].map(k => `<i><b style="width:${r[k]}%;background:${r[k] < 35 ? '#ff6b6b' : r[k] < 55 ? '#f6c453' : '#4fd18b'}"></b></i>`).join('')}</span>` : '—');
const rosterRow = (p, v) => `<tr class="${p.inj ? 'inj' : ''} ${p.mine ? 'me' : ''}"><td>${posTag(p.pos)}</td><td>${playerLink(p.id, p.n)}${p.fict ? '<span class="fict">fictício</span>' : ''}${p.num !== '' && p.num != null ? ` <small class="muted">#${esc(p.num)}</small>` : ''}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${ovrBadge(p.ovr, p.ovrRange)} ${fogNote(p)}</td><td class="num">${potTxt(p.pot, p.potRange)}</td><td>${esc(roleTxt(p.role))}</td><td>${stTxt(p)}${p.on40 && S.spec.sport === 'mlb' ? ' <small class="muted">40</small>' : ''}</td><td>${p.sal != null ? `${money(p.sal)} × ${esc(nn(p.yrs))}` : '—'}${p.expiring ? ' <b class="bad" title="contrato vence">!</b>' : ''} <small class="muted">${esc(p.contractKind && p.contractKind !== 'VET' ? p.contractKind : '')}</small></td><td class="num">${p.form != null ? `${p.form > 0 ? '+' : ''}${esc(fix(p.form, 1))}` : '—'}</td><td>${relBars(p.rel)}</td></tr>`;
registerScreen('roster', {
  title: 'Elenco',
  render(el) {
    const c = S.c, spec = S.spec, abbr = pickTeam('rosterTeam'), v = A.getRosterView(c, abbr), own = v.own;
    const grpTab = tabOf('rosterG', 'all'), sorted = !!S.ui.sort.roster;
    const groups = v.groups.filter(g => grpTab === 'all' || g.group === grpTab);
    let body;
    if (sorted) body = `<tr class="grp"><td colspan="10">Ordenado por coluna</td></tr>${sortRows('roster', groups.flatMap(g => g.players), COLS, { k: 'ovr', dir: -1 }).map(p => rosterRow(p, v)).join('')}`;
    else body = groups.map(g => `<tr class="grp"><td colspan="10">${esc(g.group)} · ${g.players.length}</td></tr>${g.players.map(p => rosterRow(p, v)).join('')}`).join('');
    const cn = v.counts;
    el.innerHTML = `${pageTitle(own ? 'Elenco' : `Elenco · ${tname(abbr)}`, teamSelect('rosterTeam', abbr))}
    ${c.role === 'PLAYER' && !myAbbr() ? '<div class="notice">Você ainda não tem clube. Explore os elencos da liga (ratings estimados pelo scouting).</div>' : ''}
    ${own ? issuesHtml(v.legality) : ''}
    <section class="panel"><div class="panel-h"><div class="chips"><b style="margin-right:6px">${crest(abbr, tcolor(abbr), 'sm')} ${esc(tname(abbr))}</b>${chip(`${cn.total} no total`)}${chip(`${cn.active} ativos`, 'ok')}${cn.minors ? chip(`${cn.minors} ${spec.sport === 'nfl' ? 'practice squad' : 'menores'}`) : ''}${cn.injured ? chip(`${cn.injured} lesionados`, 'bad') : ''}${spec.sport === 'mlb' ? chip(`${cn.on40} no 40-man`) : ''}</div>${subTabs('rosterG', [['all', 'Todos'], ...v.groups.map(g => [g.group, g.group])], grpTab)}</div>
      <div class="scroll tall"><table class="tbl" id="rosterTbl"><caption class="sr-only">Elenco</caption>${thead('roster', COLS, { k: 'ovr', dir: -1 })}${body || '<tr><td colspan="10" class="muted">Sem jogadores.</td></tr>'}</table></div>
      <p class="muted small">${own ? 'Clique no nome para abrir a ficha: ratings, contrato, lesão e relacionamentos. Ordene pelos cabeçalhos.' : 'Ratings de outros clubes são estimativas (fog of war): atribua scouts em Scouting para revelar.'} ${S.ui.sort.roster ? '<button class="ghost" data-act="roster-unsort">Agrupar por posição</button>' : ''}</p></section>
    ${v.minors ? panel('Sistema de ligas menores', `<div class="grid2">${Object.entries(v.minors).map(([lvl, list]) => `<div><b>${esc(lvl)}</b> <small class="muted">${list.length} jogadores</small><table class="tbl">${list.slice(0, 5).map(p => `<tr><td>${posTag(p.pos)}</td><td>${playerLink(p.id, p.n)}</td><td class="num">${esc(p.age)}</td><td class="num">${ovrBadge(p.ovr)}</td><td class="num">${esc(p.pot)}</td><td>${p.on40 ? '<small class="muted">40-man</small>' : ''}</td></tr>`).join('')}</table></div>`).join('')}</div>`) : ''}`;
  },
});
on('roster-unsort', () => { delete S.ui.sort.roster; refresh(); });

// ---------- team ----------
const FAC_KEYS = ['training', 'medical', 'scouting', 'youth', 'stadium'];
registerScreen('team', {
  title: 'Time',
  render(el) {
    const c = S.c, spec = S.spec, abbr = pickTeam('teamView'), t = A.getTeamView(c, abbr), own = abbr === myAbbr();
    if (!t.abbr) { el.innerHTML = `${pageTitle('Meu clube')}<div class="panel empty">${esc(t.note)}</div>`; return; }
    const fx = t.staffEffects, up = c.x.fac.upgrades;
    const fac = FAC_KEYS.map(k => { const lvl = t.facilities[k], building = up.find(u => u.key === k), cost = A.facilityCost(spec, lvl + 1); return `<div class="facility"><div><b>${esc(A.FACILITY_INFO[k].label)}</b><div class="muted small">${esc(A.FACILITY_INFO[k].effect)}</div></div><span class="lvl" role="img" aria-label="nível ${lvl} de 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= lvl ? 'on' : ''}"></i>`).join('')}</span>${own && c.role === 'GM' ? (building ? `<small class="muted">obra: ${esc(building.daysLeft)} dia(s) → nível ${esc(building.to)}</small>` : lvl < 5 ? `<button data-act="upgrade" data-k="${k}" title="Custo ${money(cost)}">Melhorar (${money(cost)})</button>` : '<small class="muted">máx.</small>') : '<span></span>'}</div>`; }).join('');
    el.innerHTML = `${pageTitle(own ? 'Time' : `Time · ${t.name}`, teamSelect('teamView', abbr))}
    <section class="dash-head" style="--tc:${esc(t.color)}">${crest(t.abbr, t.color, 'lg')}<div><h2>${esc(t.name)}</h2><div class="dash-meta">${chip(t.conf)}${chip(String(t.div))}<span class="outlook ${t.mode}">${{ contender: 'Favorito', middle: 'Meio da tabela', rebuild: 'Reconstrução' }[t.mode] || ''}</span>${t.vacancy ? chip('vaga de comando aberta', 'warn') : ''}</div></div><div class="big-wrap"><span class="big">${esc(t.record)}</span> <small class="muted">${t.streak ? esc(t.streak) : ''}</small></div></section>
    <div class="dash-grid"><div class="stack">
      ${panel('Panorama', `<div class="stat-grid"><div class="stat"><small>Força do elenco</small><b>${fix(t.rating, 1)}</b></div><div class="stat"><small>Ranking</small><b>#${esc(nn(t.rank))}</b></div><div class="stat"><small>Prestígio</small><b>${esc(t.prestige)}</b></div><div class="stat"><small>Mercado</small><b>${fix(t.market, 2)}×</b></div><div class="stat"><small>Torcida</small><b>${esc(t.fans)}</b></div><div class="stat"><small>Escolhas (2 anos)</small><b>${esc(t.picks)}</b></div></div>
        <div style="margin-top:10px"><div class="bar2 ${t.payroll > t.cap ? 'bad' : ''}" role="img" aria-label="folha ${money(t.payroll)} de ${money(t.cap)}"><i style="width:${Math.min(100, (t.payroll / t.cap) * 100).toFixed(0)}%"></i></div><small class="muted">Folha ${money(t.payroll)} / ${esc(t.capKind === 'hard' ? 'teto' : 'CBT')} ${money(t.cap)}</small></div>`)}
      ${panel('Instalações', fac)}
      ${panel('Principais jogadores', `<table class="tbl">${t.top.map(p => `<tr><td>${posTag(p.pos)}</td><td>${playerLink(p.id, p.n)}</td><td class="num">${esc(nn(p.age))}</td><td class="num">${ovrBadge(p.ovr, p.ovrRange)}</td><td class="num">${potTxt(p.pot, p.potRange)}</td><td>${p.sal != null ? `${money(p.sal)} × ${esc(nn(p.yrs))}` : ''}</td></tr>`).join('')}</table>`)}
    </div><div class="stack">
      ${panel('Comando', `<dl class="dl"><dt>Técnico</dt><dd>${esc(t.coach.name)} · nota ${esc(t.coach.rating)}${t.coach.user ? ' <span class="chip ok">você</span>' : ''}</dd><dt>Dirigente</dt><dd>${esc(t.gm.name)} · nota ${esc(t.gm.rating)}${t.gm.user ? ' <span class="chip ok">você</span>' : ''}</dd></dl>`)}
      ${panel('Efeito da comissão técnica', `${meter('Desenvolvimento', (fx.dev - 0.8) / 0.4 * 100, { sub: `evolução ×${fx.dev}` })}${meter('Medicina', (fx.med + 0.7) / 1.4 * 100, { sub: `lesões ×${fx.injuryMult}` })}${meter('Ataque', (fx.offense + 1) / 2 * 100)}${meter('Defesa', (fx.defense + 1) / 2 * 100)}${meter('Scouting', fx.scout)}${meter('Treinador principal', fx.head)}`, own ? '<button class="ghost" data-act="goto" data-s="staff">Comissão</button>' : '')}
      ${own && c.role !== 'PLAYER' ? panel('Finanças', `<div class="stat-grid"><div class="stat"><small>Caixa</small><b>${money(c.x.fin.cash)}</b></div><div class="stat"><small>Orç. folha</small><b>${money(c.x.fin.budget.payroll)}</b></div><div class="stat"><small>Orç. staff</small><b>${money(c.x.fin.budget.staff)}</b></div><div class="stat"><small>Orç. instal.</small><b>${money(c.x.fin.budget.facilities)}</b></div></div>${c.x.fin.last ? `<p class="muted small">Última temporada (${esc(c.x.fin.last.s)}): receita ${money(c.x.fin.last.rev)} · despesa ${money(c.x.fin.last.exp)} · lucro ${money(c.x.fin.last.profit)}${c.x.fin.last.tax ? ` · imposto ${money(c.x.fin.last.tax)}` : ''}</p>` : ''}`) : ''}
    </div></div>`;
  },
});
on('upgrade', el => { const r = A.upgradeFacility(S.spec, S.c, el.dataset.k); toast(r.text, !r.ok); if (r.ok) touch(); refresh(); });
