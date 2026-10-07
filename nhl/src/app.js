// NHL Universe 2D — shell (same visual identity as NFL Universe 2D, separate app/engine).
// Hash routes: #home #teams #team/<ABBR> #roster/<ABBR> #prospects/<ABBR> #arenas #history #rivalries #rink
import { D, teamBy, logo, placeholder, playerName, nameOf, age, makeAttrs, overall, getRoster, getProspects, hash, POS_LABEL, cachedRosterCount } from './nhlData.js';
import { mountRink } from './rink.js';

const $ = s => document.querySelector(s);
const content = $('#content');
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
let cleanup = null; // active view teardown (rink rAF)
let lastTeam = localStorage.getItem('asu_nhl_team') || 'BOS';

const NAV = [
  ['', [['home', 'Home', '⌂']]],
  ['LIGA', [['teams', 'Times', '▦'], ['roster', 'Elencos', '☰'], ['prospects', 'Prospectos', '★'], ['arenas', 'Arenas', '⌂']]],
  ['HISTÓRIA', [['history', 'História', '🏆'], ['rivalries', 'Rivalidades', '⚔']]],
  ['JOGO', [['rink', 'Partida 2D', '▶']]],
];

const ovrCls = o => (o >= 80 ? 'ovr-elite' : o >= 74 ? 'ovr-good' : o >= 68 ? 'ovr-avg' : 'ovr-low');
const ovrBadge = (o, big) => `<span class="ovr ${ovrCls(o)} ${big ? 'ovr-big' : ''}">${o}</span>`;
const img = (src, name, cls) => `<img class="${cls}" src="${esc(src || placeholder(name))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${placeholder(name)}'">`;
const teamOpts = sel => D.teams.map(t => `<option value="${t.abbr}" ${t.abbr === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
function setTitle(t, s = 'NHL Universe 2026–27') { $('#pageTitle').textContent = t; $('#pageSub').textContent = s; }
function pickTeam(a) { if (teamBy(a)) { lastTeam = a; localStorage.setItem('asu_nhl_team', a); } return lastTeam; }

function renderNav(cur) {
  $('#nav').innerHTML = NAV.map(([sec, items]) => `${sec ? `<div class="nav-sec">${sec}</div>` : ''}${items.map(([k, l, ic]) => `<a class="nav-btn ${cur === k ? 'active' : ''}" href="#${k}"><span class="nav-ic">${ic}</span>${l}</a>`).join('')}`).join('');
}

// ---------- views ----------
function home() {
  setTitle('Home', 'NHL Universe 2D · liga, atletas, prospectos e história');
  const recent = D.champions.slice(-6).reverse();
  const topRiv = [...D.rivalries].sort((a, b) => b.score - a.score).slice(0, 5);
  const t = teamBy(lastTeam);
  content.innerHTML = `
  <div class="nhl-hero panel"><div class="hero-id"><img class="logo" src="${t.logo}" width="72" height="72" alt="${t.abbr}"><div><div class="eyebrow">Sua franquia em foco</div><h2>${esc(t.name)}</h2>
    <div class="hero-meta"><span>${t.conference} · ${t.division}</span><span>${esc(t.arena)}</span><span>Fundado em ${t.founded}</span></div></div></div>
    <div class="nhl-hero-actions"><a class="btn primary" href="#roster/${t.abbr}">Elenco</a><a class="btn" href="#prospects/${t.abbr}">Prospectos</a><a class="btn" href="#rink">Partida 2D</a></div></div>
  <div class="kpis" style="margin:10px 0"><div class="kpi"><b>32</b><span class="muted small"> franquias</span></div><div class="kpi"><b>35</b><span class="muted small"> atributos</span></div><div class="kpi"><b>0–99</b><span class="muted small"> escala</span></div><div class="kpi"><b>${D.champions.length}</b><span class="muted small"> Stanley Cups</span></div><div class="kpi"><b>${D.rivalries.length}</b><span class="muted small"> rivalidades</span></div></div>
  <div class="nhl-grid2">
    <div class="panel"><div class="panel-h"><b>Campeões recentes</b><a href="#history">História →</a></div>${recent.map(c => `<div class="nhl-row"><span class="mono">${c.year}</span><b>${esc(c.champion)}</b></div>`).join('')}</div>
    <div class="panel"><div class="panel-h"><b>Maiores rivalidades</b><a href="#rivalries">Todas →</a></div>${topRiv.map(r => `<div class="nhl-row"><img class="logo" src="${logo(r.a)}" width="22" height="22" alt="${r.a}"><b>${r.a}</b><span class="muted">vs</span><img class="logo" src="${logo(r.b)}" width="22" height="22" alt="${r.b}"><b>${r.b}</b><span class="grow"></span><span class="badge">${r.score}</span></div>`).join('')}</div>
  </div>
  <div class="panel" style="margin-top:10px"><div class="panel-h"><b>Escolher franquia</b></div><div class="nhl-logo-strip">${D.teams.map(x => `<a href="#team/${x.abbr}" title="${esc(x.name)}" class="${x.abbr === t.abbr ? 'on' : ''}"><img class="logo" src="${x.logo}" width="34" height="34" alt="${x.abbr}"></a>`).join('')}</div>
  <p class="muted small" style="margin:8px 0 0">Elencos, fotos e prospectos são carregados da NHL Web API. Os 35 ratings são próprios do simulador, determinísticos — não são ratings oficiais.</p></div>`;
}

function teams() {
  setTitle('Times', '32 franquias · conferências, divisões, arenas');
  content.innerHTML = `<div class="toolbar"><select id="conf"><option value="">Todas conferências</option><option>Eastern</option><option>Western</option></select><select id="div"><option value="">Todas divisões</option>${[...new Set(D.teams.map(t => t.division))].sort().map(d => `<option>${d}</option>`).join('')}</select></div><div class="nhl-team-grid" id="tg"></div>`;
  const draw = () => {
    const c = $('#conf').value, d = $('#div').value;
    $('#tg').innerHTML = D.teams.filter(t => (!c || t.conference === c) && (!d || t.division === d)).map(t => `<a class="panel nhl-team-card" href="#team/${t.abbr}"><img class="logo" src="${t.logo}" width="54" height="54" alt="${t.abbr}"><div><b>${esc(t.name)}</b><div class="muted small">${t.conference} · ${t.division}</div><div class="muted small">${esc(t.arena)}</div></div></a>`).join('');
  };
  $('#conf').onchange = draw; $('#div').onchange = draw; draw();
}

async function team(abbr) {
  const t = teamBy(pickTeam(abbr));
  setTitle(t.name, `${t.conference} · ${t.division}`);
  content.innerHTML = `<div class="nhl-hero panel"><div class="hero-id"><img class="logo" src="${t.logo}" width="84" height="84" alt="${t.abbr}"><div><div class="eyebrow">${t.city}</div><h2>${esc(t.name)}</h2><div class="hero-meta"><span>${esc(t.arena)}</span><span>Fundado em ${t.founded}</span><span>${D.champions.filter(c => c.champion === t.name).length} Stanley Cups</span></div></div></div>
    <div class="nhl-hero-actions"><a class="btn primary" href="#roster/${t.abbr}">Elenco completo</a><a class="btn" href="#prospects/${t.abbr}">Prospectos</a></div></div>
    <div class="nhl-grid2" style="margin-top:10px"><div class="panel"><div class="panel-h"><b>Destaques do elenco (OVR)</b><a href="#roster/${t.abbr}">Ver todos →</a></div><div id="teamTop" class="muted">Carregando elenco…</div></div>
    <div class="panel"><div class="panel-h"><b>Rivalidades</b></div>${D.rivalries.filter(r => r.a === t.abbr || r.b === t.abbr).map(r => { const o = r.a === t.abbr ? r.b : r.a; return `<div class="nhl-row"><img class="logo" src="${logo(o)}" width="22" height="22" alt="${o}"><b>${esc(teamBy(o)?.name || o)}</b><span class="grow muted small">${esc(r.label)}</span><span class="badge">${r.score}</span></div>`; }).join('') || '<p class="muted">Nenhuma rivalidade cadastrada.</p>'}</div></div>`;
  try {
    const r = await getRoster(t.abbr);
    const top = r.map(p => ({ p, o: overall(p, makeAttrs(p)) })).sort((a, b) => b.o - a.o).slice(0, 8);
    const el = $('#teamTop'); if (el) { el.className = ''; el.innerHTML = top.map(({ p, o }) => playerRow(p, o)).join(''); bindPlayers(el); }
  } catch (e) { const el = $('#teamTop'); if (el) el.innerHTML = apiError(e); }
}

function apiError(e) { return `<div class="nhl-notice bad">${esc(e.message)} — a NHL Web API não respondeu (sem internet ou bloqueio do navegador). Abra via servidor local com internet.</div>`; }
function playerRow(p, o) { const nm = playerName(p); return `<div class="nhl-row clickable" data-pid="${p.id}" data-team="${p.teamAbbr}">${img(p.headshot, nm, 'nhl-av')}<b>${esc(nm)}</b><span class="muted small">#${p.sweaterNumber ?? '—'} · ${POS_LABEL[p.positionCode] || p.positionCode || '—'}</span><span class="grow"></span>${ovrBadge(o)}</div>`; }
function playerCard(p) {
  const nm = playerName(p), o = overall(p, makeAttrs(p));
  return `<div class="panel nhl-pcard" data-pid="${p.id}" data-team="${p.teamAbbr}">${img(p.headshot, nm, 'nhl-photo')}<div class="nhl-pcard-body"><b>${esc(nm)}</b><div class="muted small">#${p.sweaterNumber ?? '—'} · ${POS_LABEL[p.positionCode] || p.positionCode || '—'} · ${p.shootsCatches || '—'}</div><div class="muted small">${age(p.birthDate) ?? '—'} anos · ${esc(p.birthCountry || '—')}</div></div>${ovrBadge(o)}</div>`;
}
function bindPlayers(scope) {
  scope.querySelectorAll('[data-pid]').forEach(el => el.addEventListener('click', async () => {
    const r = await getRoster(el.dataset.team); const p = r.find(x => String(x.id) === el.dataset.pid); if (p) showPlayer(p);
  }));
}

function showPlayer(p) {
  const nm = playerName(p), attrs = makeAttrs(p), o = overall(p, attrs), t = teamBy(p.teamAbbr), goalie = p.positionCode === 'G';
  const m = $('#modal'); m.classList.remove('hidden');
  $('#modalContent').innerHTML = `<div class="hero-id">${img(p.headshot, nm, 'nhl-photo big')}<div><div class="eyebrow">${esc(t?.name || p.teamAbbr)}</div><h2>${esc(nm)}</h2>
    <div class="hero-meta"><span>#${p.sweaterNumber ?? '—'}</span><span>${POS_LABEL[p.positionCode] || p.positionCode}</span><span>${goalie ? 'Catches' : 'Shoots'} ${p.shootsCatches || '—'}</span><span>${age(p.birthDate) ?? '—'} anos</span><span>${p.heightInCentimeters || '—'} cm · ${p.weightInKilograms || '—'} kg</span><span>${esc(p.birthCountry || '—')}</span></div></div><span class="grow"></span>${ovrBadge(o, true)}</div>
    <div class="sec-h">35 atributos · ${goalie ? 'goleiro' : 'skater'}</div>
    <div class="nhl-attr-grid">${attrs.map(a => `<div class="nhl-attr"><span>${esc(a.name)}</span><b>${a.value}</b><i style="width:${a.value}%" class="${ovrCls(a.value)}"></i></div>`).join('')}</div>
    <p class="muted small">Ratings próprios do simulador (determinísticos). Dados biográficos e foto: NHL.</p>`;
}

async function roster(abbr) {
  const cur = pickTeam(abbr || lastTeam);
  setTitle('Elencos', 'Roster atual · fotos · 35 atributos');
  content.innerHTML = `<div class="toolbar"><select id="teamSel">${teamOpts(cur)}</select><input id="q" placeholder="Buscar atleta"><div class="seg" id="posSeg">${['ALL', 'C', 'L', 'R', 'D', 'G'].map(k => `<button data-pos="${k}" class="${k === 'ALL' ? 'on' : ''}">${k === 'ALL' ? 'Todos' : POS_LABEL[k]}</button>`).join('')}</div></div><div id="area" class="muted">Carregando elenco…</div>`;
  let pos = 'ALL', data = [];
  const draw = () => {
    const q = $('#q').value.toLowerCase();
    const list = data.filter(p => (pos === 'ALL' || p.positionCode === pos) && playerName(p).toLowerCase().includes(q));
    $('#area').className = 'nhl-player-grid'; $('#area').innerHTML = list.map(playerCard).join('') || '<p class="muted">Nenhum atleta.</p>'; bindPlayers($('#area'));
  };
  $('#teamSel').onchange = e => { location.hash = `#roster/${e.target.value}`; };
  $('#q').oninput = draw;
  $('#posSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; pos = b.dataset.pos; $('#posSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  try { data = await getRoster(cur); if ($('#area')) draw(); } catch (e) { if ($('#area')) { $('#area').className = ''; $('#area').innerHTML = apiError(e); } }
}

async function prospects(abbr) {
  const cur = pickTeam(abbr || lastTeam);
  setTitle('Prospectos', 'Pipeline de cada franquia (NHL Web API)');
  content.innerHTML = `<div class="toolbar"><select id="teamSel">${teamOpts(cur)}</select></div><div id="area" class="muted">Carregando prospectos…</div>`;
  $('#teamSel').onchange = e => { location.hash = `#prospects/${e.target.value}`; };
  try {
    const r = await getProspects(cur); const area = $('#area'); if (!area) return;
    area.className = 'nhl-player-grid';
    area.innerHTML = r.map(p => {
      const nm = playerName(p) || nameOf(p.name) || p.fullName || 'Prospect';
      const pos = p.positionCode || p.position || '—';
      const id = p.id || p.playerId || hash(nm);
      const mock = { ...p, id, positionCode: pos };
      return `<div class="panel nhl-pcard">${img(p.headshot || p.mugShot, nm, 'nhl-photo')}<div class="nhl-pcard-body"><b>${esc(nm)}</b><div class="muted small">${POS_LABEL[pos] || pos} · ${esc(p.birthCountry || '—')}</div><div class="muted small">${age(p.birthDate) ?? '—'} anos</div></div>${ovrBadge(overall(mock, makeAttrs(mock)))}</div>`;
    }).join('') || '<p class="muted">Nenhum prospecto retornado.</p>';
  } catch (e) { const area = $('#area'); if (area) { area.className = ''; area.innerHTML = apiError(e); } }
}

function arenas() {
  setTitle('Arenas', 'Casa das 32 franquias');
  content.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Franquia</th><th>Arena</th><th>Cidade</th><th>Conferência</th><th>Divisão</th></tr></thead><tbody>${D.teams.map(t => `<tr><td><a href="#team/${t.abbr}" class="player-cell"><img class="logo" src="${t.logo}" width="26" height="26" alt="${t.abbr}">${esc(t.name)}</a></td><td>${esc(t.arena)}</td><td>${esc(t.city)}</td><td>${t.conference}</td><td>${t.division}</td></tr>`).join('')}</tbody></table></div>`;
}

function history() {
  setTitle('História', `Stanley Cup · ${D.champions[0].year}–${D.champions.at(-1).year}`);
  const tally = {}; D.champions.forEach(c => { tally[c.champion] = (tally[c.champion] || 0) + 1; });
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10);
  content.innerHTML = `<div class="nhl-grid2"><div class="panel"><div class="panel-h"><b>Campeões por temporada</b></div><div class="table-wrap" style="max-height:70vh"><table class="table compact"><thead><tr><th>Ano</th><th>Campeão</th></tr></thead><tbody>${[...D.champions].reverse().map(c => `<tr><td class="mono">${c.year}</td><td>${esc(c.champion)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="panel"><div class="panel-h"><b>Mais títulos</b></div>${top.map(([n, v]) => `<div class="nhl-row"><b>${esc(n)}</b><span class="grow"></span><span class="badge">${v}</span></div>`).join('')}</div></div>`;
}

function rivalries() {
  setTitle('Rivalidades', 'RivalryScore inicial (0–100)');
  content.innerHTML = `<div class="nhl-team-grid">${[...D.rivalries].sort((a, b) => b.score - a.score).map(r => { const a = teamBy(r.a), b = teamBy(r.b); return `<div class="panel"><div class="nhl-row"><img class="logo" src="${a.logo}" width="34" height="34" alt="${a.abbr}"><b>${a.abbr}</b><span class="muted">vs</span><b>${b.abbr}</b><img class="logo" src="${b.logo}" width="34" height="34" alt="${b.abbr}"><span class="grow"></span><span class="badge">${r.score}</span></div><div class="muted small">${esc(r.label)}</div><div class="nhl-bar"><i style="width:${r.score}%"></i></div></div>`; }).join('')}</div>`;
}

function rink() {
  setTitle('Partida 2D', 'Rink 2D — protótipo (motor NHL em desenvolvimento)');
  cleanup = mountRink(content);
}

// ---------- router ----------
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  $('#modal').classList.add('hidden');
  const [view, arg] = (location.hash.slice(1) || 'home').split('/');
  const map = { home, teams, team, roster, prospects, arenas, history, rivalries, rink };
  const fn = map[view] || home;
  renderNav(view === 'team' ? 'teams' : map[view] ? view : 'home');
  fn(arg);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// Logo fallback: a logo that fails to load becomes a team-abbreviation badge of the same size (no broken icons).
document.addEventListener('error', e => {
  const el = e.target;
  if (!(el instanceof HTMLImageElement) || !el.classList.contains('logo')) return;
  const b = document.createElement('span');
  b.className = 'nhl-logo-fb'; b.textContent = (el.alt || '').slice(0, 3) || '?';
  const w = el.getAttribute('width') || 34; b.style.width = b.style.height = w + 'px'; b.style.fontSize = Math.max(8, w * 0.3) + 'px';
  el.replaceWith(b);
}, true);
$('#closeModal').onclick = () => $('#modal').classList.add('hidden');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.add('hidden'); });
$('#syncAll').onclick = async () => {
  const s = $('#sourcePill'); let ok = 0; s.textContent = 'Sincronizando…';
  for (const t of D.teams) { try { await getRoster(t.abbr); ok++; s.textContent = `${ok}/32 elencos`; } catch { /* keep going */ } }
  s.textContent = `${cachedRosterCount()}/32 elencos em cache da sessão`;
};
route();
