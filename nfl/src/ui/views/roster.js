// Roster (filters, search, sortable columns) and Depth Chart (engine starters first, then backups by OVR).
import { esc, avatar, teamLogo, ovrBadge, ratingsOf, pid, groupOf, keyAttrs, keyForAttribute, heightStr, statusLabel } from '../components.js';
import { buildLineups } from '../../nflEngine.js';

const GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P', 'LS'];
const STATUSES = ['ACT', 'RES', 'DEV', 'INA'];

export function rosterView(ctx, mode = 'roster') {
  const { state, content, teamBy } = ctx;
  const arg = state.route.arg;
  const f = state.ui.roster ||= { team: state.career?.team || 'SEA', q: '', group: '', status: '', minOvr: '', ageMin: '', ageMax: '', sort: 'o', dir: -1 };
  if (arg) f.team = arg;
  if (mode === 'depth' && (f.team === 'ALL' || !state.teams.some(t => t.abbr === f.team))) f.team = state.career?.team || 'SEA';
  const T = f.team === 'ALL' ? null : teamBy(f.team);
  ctx.setTitle(mode === 'depth' ? 'Depth Chart' : 'Roster', T ? `${T.name} · ${T.conference} ${T.division}` : 'Toda a liga');
  const injured = new Map((state.career?.injuries || []).map(i => [i.id || i.name, i]));
  content.innerHTML = `
  <div class="page-head" style="--tc:${T?.color || '#24364d'}">${T ? teamLogo(T, 'lg') : ''}<div><h2>${esc(T?.name || 'NFL — toda a liga')}</h2><small class="muted">${state.roster.filter(p => !T || p.team === T.abbr).length} atletas</small></div>
    <div class="seg big"><a href="#roster/${f.team}" class="${mode === 'roster' ? 'on' : ''}">Roster</a><a href="#depth/${f.team === 'ALL' ? (state.career?.team || 'SEA') : f.team}" class="${mode === 'depth' ? 'on' : ''}">Depth Chart</a></div></div>
  <div class="toolbar">
    <select id="fTeam">${mode === 'roster' ? `<option value="ALL" ${f.team === 'ALL' ? 'selected' : ''}>Toda a liga</option>` : ''}${state.teams.map(t => `<option value="${t.abbr}" ${f.team === t.abbr ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
    ${mode === 'roster' ? `<input id="fQ" placeholder="Buscar por nome" value="${esc(f.q)}">
    <select id="fGroup"><option value="">Todas posições</option>${GROUPS.map(g => `<option ${f.group === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
    <select id="fStatus"><option value="">Todos status</option>${STATUSES.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}</select>
    <input id="fOvr" type="number" placeholder="OVR mín." value="${esc(f.minOvr)}" class="num">
    <input id="fAgeMin" type="number" placeholder="Idade mín." value="${esc(f.ageMin)}" class="num"><input id="fAgeMax" type="number" placeholder="Idade máx." value="${esc(f.ageMax)}" class="num">
    <button id="fClear">Limpar</button>` : ''}
  </div>
  <div id="rosterBody"></div>`;
  const $ = s => content.querySelector(s);
  $('#fTeam').onchange = e => { f.team = e.target.value; ctx.navigate(mode, f.team); };
  if (mode === 'depth') return depthChart(ctx, T, injured);
  const refresh = () => {
    f.q = $('#fQ').value; f.group = $('#fGroup').value; f.status = $('#fStatus').value; f.minOvr = $('#fOvr').value; f.ageMin = $('#fAgeMin').value; f.ageMax = $('#fAgeMax').value;
    drawTable();
  };
  ['#fQ', '#fOvr', '#fAgeMin', '#fAgeMax'].forEach(id => $(id).oninput = refresh);
  ['#fGroup', '#fStatus'].forEach(id => $(id).onchange = refresh);
  $('#fClear').onclick = () => { Object.assign(f, { q: '', group: '', status: '', minOvr: '', ageMin: '', ageMax: '' }); rosterView(ctx, mode); };

  function drawTable() {
    const q = f.q.trim().toLowerCase();
    let list = state.roster.filter(p => (f.team === 'ALL' || p.team === f.team) && (!q || p.full_name.toLowerCase().includes(q)) && (!f.group || groupOf(p) === f.group || (f.group === 'K' && p.position === 'K'))
      && (!f.status || p.status === f.status) && (!f.ageMin || (p.age ?? 0) >= +f.ageMin) && (!f.ageMax || (p.age ?? 99) <= +f.ageMax));
    let rows = list.map(p => ({ p, ...ratingsOf(p) }));
    if (f.minOvr) rows = rows.filter(x => x.o >= +f.minOvr);
    const key = { name: x => x.p.full_name, pos: x => x.p.depth_chart_position || x.p.position, team: x => x.p.team, o: x => x.o, age: x => x.p.age ?? 0, exp: x => x.p.years_exp, ht: x => x.p.height, wt: x => x.p.weight, st: x => x.p.status, col: x => x.p.college }[f.sort] || (x => x.o);
    rows.sort((a, b) => { const va = key(a), vb = key(b); return (va > vb ? 1 : va < vb ? -1 : 0) * f.dir; });
    const total = rows.length;
    rows = rows.slice(0, 400);
    const th = (k, l) => `<th data-sort="${k}" class="sortable ${f.sort === k ? 'sorted' : ''}">${l}${f.sort === k ? (f.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    $('#rosterBody').innerHTML = `<div class="table-wrap"><table class="table roster-table"><thead><tr>${th('name', 'Atleta')}${th('pos', 'Pos')}${f.team === 'ALL' ? th('team', 'Time') : ''}${th('o', 'OVR')}<th>Destaques</th>${th('age', 'Idade')}${th('exp', 'Exp')}${th('ht', 'Alt')}${th('wt', 'Peso')}${th('col', 'College')}${th('st', 'Status')}</tr></thead><tbody>
      ${rows.map(({ p, r, o }) => { const inj = injured.get(pid(p)) || injured.get(p.full_name); const ka = keyAttrs(p).slice(0, 3).map(a => `<span class="mini-attr" title="${esc(a)}">${esc(a.split(' ').map(w => w[0]).join(''))} <b>${r[keyForAttribute(a)]}</b></span>`).join('');
        return `<tr data-pid="${esc(pid(p))}"><td><div class="player-cell">${avatar(p, 'sm')}<div><b>${esc(p.full_name)}</b><small class="muted">#${esc(p.jersey_number || '—')}</small></div></div></td><td><span class="badge">${esc(p.depth_chart_position || p.position)}</span></td>${f.team === 'ALL' ? `<td>${teamLogo(teamBy(p.team), 'xs')} ${esc(p.team)}</td>` : ''}<td>${ovrBadge(o)}</td><td class="mini-attrs">${ka}</td><td>${p.age ?? '—'}</td><td>${p.years_exp}</td><td>${heightStr(p.height)}</td><td>${p.weight || '—'}</td><td class="muted ellip">${esc(p.college)}</td><td>${inj ? `<span class="st st-inj">✚ ${esc(inj.type)} ${inj.weeks}s</span>` : `<span class="st st-${esc(p.status)}">${esc(statusLabel(p.status))}</span>`}</td></tr>`; }).join('')}
      </tbody></table></div><p class="muted small">Exibindo ${rows.length} de ${total}${total > 400 ? ' (limite de 400 linhas — refine os filtros)' : ''}.</p>`;
    $('#rosterBody').querySelectorAll('th[data-sort]').forEach(h => h.onclick = () => { const k = h.dataset.sort; f.dir = f.sort === k ? -f.dir : (k === 'name' || k === 'pos' || k === 'team' || k === 'col' ? 1 : -1); f.sort = k; drawTable(); });
    $('#rosterBody').querySelectorAll('tr[data-pid]').forEach(tr => tr.onclick = () => ctx.navigate('player', tr.dataset.pid));
  }
  drawTable();
}

// Depth chart rows. starters = slots the engine fills (nflEngine.buildLineups); everything else ordered by OVR.
const OFF_ROWS = [['QB', p => groupOf(p) === 'QB'], ['RB', p => groupOf(p) === 'RB'], ['WR', p => groupOf(p) === 'WR'], ['TE', p => groupOf(p) === 'TE'],
  ['T', p => groupOf(p) === 'OL' && /^(T|OT|LT|RT)$/.test(dpos(p))], ['G', p => groupOf(p) === 'OL' && /^(G|OG|LG|RG)$/.test(dpos(p))], ['C', p => groupOf(p) === 'OL' && dpos(p) === 'C'], ['OL', p => groupOf(p) === 'OL' && !/^(T|OT|LT|RT|G|OG|LG|RG|C)$/.test(dpos(p))]];
const DEF_ROWS = [['EDGE/DE', p => /^(DE|EDGE|OLB)$/.test(dpos(p)) && ['DL', 'LB'].includes(groupOf(p))], ['DT', p => /^(DT|NT)$/.test(dpos(p))], ['LB', p => groupOf(p) === 'LB' && !/^(DE|EDGE|OLB)$/.test(dpos(p))],
  ['DL', p => groupOf(p) === 'DL' && !/^(DE|EDGE|OLB|DT|NT)$/.test(dpos(p))], ['CB', p => groupOf(p) === 'DB' && /^(CB|NB|DB)$/.test(dpos(p))], ['S', p => groupOf(p) === 'DB' && /^(S|FS|SS)$/.test(dpos(p))]];
const ST_ROWS = [['K', p => p.position === 'K'], ['P', p => p.position === 'P'], ['LS', p => p.position === 'LS']];
const dpos = p => String(p.depth_chart_position || p.position || '').toUpperCase();
const SLOT_NAMES = { off: ['QB', 'RB', 'WR1', 'WR2', 'WR3', 'TE', 'T', 'T', 'G', 'G', 'C'], def: ['DE', 'DE', 'DT', 'DT', 'MLB', 'LB', 'LB', 'CB1', 'CB2', 'S', 'S'] };

function depthChart(ctx, T, injured) {
  const { state, content } = ctx;
  const team = state.roster.filter(p => p.team === T.abbr && !['CUT', 'RET'].includes(p.status));
  if (!team.length) { content.querySelector('#rosterBody').innerHTML = '<p class="muted">Roster não carregado.</p>'; return; }
  const ls = buildLineups(state.roster, T.abbr, T.abbr);
  const starterSlot = new Map();
  ls.offense.forEach((p, i) => starterSlot.set(pid(p), SLOT_NAMES.off[i]));
  ls.defense.forEach((p, i) => starterSlot.set(pid(p), SLOT_NAMES.def[i]));
  const used = new Set();
  const col = (label, match) => {
    const list = team.filter(p => !used.has(pid(p)) && match(p)).map(p => ({ p, o: ratingsOf(p).o, s: starterSlot.get(pid(p)) }))
      .sort((a, b) => (b.s ? 1 : 0) - (a.s ? 1 : 0) || b.o - a.o);
    list.forEach(x => used.add(pid(x.p)));
    if (!list.length) return '';
    let backups = 0;
    return `<div class="depth-col"><div class="depth-h">${label}<small>${list.length}</small></div>${list.map(({ p, o, s }) => {
      const inj = injured.get(pid(p)) || injured.get(p.full_name);
      const tier = s ? 'starter' : p.status !== 'ACT' ? 'reserve' : (++backups <= 2 ? 'backup' : 'reserve');
      return `<a class="depth-p ${tier}" href="#player/${encodeURIComponent(pid(p))}">${avatar(p, s ? 'md' : 'xs')}<span><b>${esc(p.full_name)}</b><small>${s ? `<em class="tag">${esc(s)}</em>` : `<em class="tag t-${tier}">${tier === 'backup' ? 'BACKUP' : 'RESERVA'}</em>`} #${esc(p.jersey_number || '—')} · ${esc(dpos(p))}${inj ? ` · <i class="bad">✚ ${esc(inj.type)}</i>` : p.status !== 'ACT' ? ` · ${esc(p.status)}` : ''}</small></span>${ovrBadge(o)}</a>`;
    }).join('')}</div>`;
  };
  content.querySelector('#rosterBody').innerHTML = `
    <p class="muted small">Titulares = escalação usada pelo motor (seleção automática por OVR + depth_chart_position; jogadores lesionados na carreira ficam fora das partidas da carreira).</p>
    <h3 class="sec-h">Ataque</h3><div class="depth-grid">${OFF_ROWS.map(([l, m]) => col(l, m)).join('')}</div>
    <h3 class="sec-h">Defesa</h3><div class="depth-grid">${DEF_ROWS.map(([l, m]) => col(l, m)).join('')}</div>
    <h3 class="sec-h">Special Teams</h3><div class="depth-grid">${ST_ROWS.map(([l, m]) => col(l, m)).join('')}</div>`;
}
