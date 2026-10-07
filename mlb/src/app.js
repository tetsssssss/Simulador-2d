// MLB Universe 2D — shell (same visual identity as NFL/NHL Universe 2D, separate app/engine).
// Hash routes: #home #teams #team/<ABBR> #roster/<ABBR> #prospects #draft/<YEAR> #stadiums #rivalries #history #diamond
import { D, teamBy, photo, fallback, pos, positionalOvr, fixedRatings, adaptiveRatings, roster, person, draft, prospects, hash, cachedRosterCount } from './mlbData.js';
import { mountMatch } from './game/matchView.js';
import { demoRoster } from './game/lineup.js';

const $ = s => document.querySelector(s);
const content = $('#content');
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
let cleanup = null; // active view teardown (diamond rAF)
let lastTeam = store.get('asu_mlb_team') || 'NYY';
let routeToken = 0; // ignores async results from a view the user already left

const NAV = [
  ['', [['home', 'Home', '⌂']]],
  ['LIGA', [['teams', 'Franquias', '▦'], ['roster', 'Elencos', '☰'], ['prospects', 'Prospectos', '★'], ['draft', 'Draft', '⇩'], ['stadiums', 'Estádios', '⌂']]],
  ['HISTÓRIA', [['rivalries', 'Rivalidades', '⚔'], ['history', 'Histórico', '🏆']]],
  ['JOGO', [['diamond', 'Partida 2D', '▶']]],
];

const ovrCls = o => (o >= 80 ? 'ovr-elite' : o >= 72 ? 'ovr-good' : o >= 64 ? 'ovr-avg' : 'ovr-low');
const ovrBadge = (o, big) => `<span class="ovr ${ovrCls(o)} ${big ? 'ovr-big' : ''}">${o}</span>`;
const img = (src, name, cls) => `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${fallback(name)}'">`;
const logoImg = (t, size) => `<img class="logo" src="${t.logo}" width="${size}" height="${size}" alt="${t.abbr}">`;
const teamOpts = sel => D.teams.map(t => `<option value="${t.abbr}" ${t.abbr === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
function setTitle(t, s = 'MLB Universe 2026') { $('#pageTitle').textContent = t; $('#pageSub').textContent = s; }
function pickTeam(a) { if (teamBy(a)) { lastTeam = a; store.set('asu_mlb_team', a); } return lastTeam; }
const alive = tok => tok === routeToken;

function renderNav(cur) {
  $('#nav').innerHTML = NAV.map(([sec, items]) => `${sec ? `<div class="nav-sec">${sec}</div>` : ''}${items.map(([k, l, ic]) => `<a class="nav-btn ${cur === k ? 'active' : ''}" href="#${k}"><span class="nav-ic">${ic}</span>${l}</a>`).join('')}`).join('');
}
function apiError(e) { return `<div class="mlb-notice bad">${esc(e.message)} — a MLB StatsAPI não respondeu (sem internet ou bloqueio do navegador). Abra via servidor local com internet.</div>`; }

// ---------- views ----------
function home() {
  setTitle('Home', 'MLB Universe 2D · franquias, atletas, prospectos, draft e história');
  const t = teamBy(lastTeam);
  const recent = D.worldSeries.slice(-6).reverse();
  const topRiv = [...D.rivalries].sort((a, b) => b.score - a.score).slice(0, 5);
  content.innerHTML = `
  <div class="mlb-hero panel"><div class="hero-id">${logoImg(t, 72)}<div><div class="eyebrow">Sua franquia em foco</div><h2>${esc(t.name)}</h2>
    <div class="hero-meta"><span>${t.league} ${t.division}</span><span>${esc(t.stadium)}</span><span>${esc(t.city)}</span></div></div></div>
    <div class="mlb-hero-actions"><a class="btn primary" href="#roster/${t.abbr}">Elenco</a><a class="btn" href="#draft/2026">Draft 2026</a><a class="btn" href="#diamond">Partida 2D</a></div></div>
  <div class="kpis" style="margin:10px 0"><div class="kpi"><b>${D.teams.length}</b><span class="muted small"> franquias</span></div><div class="kpi"><b>${D.fixedAttrs.length}</b><span class="muted small"> atributos fixos</span></div><div class="kpi"><b>${D.adaptiveAttrs.length}</b><span class="muted small"> adaptativos</span></div><div class="kpi"><b>0–99</b><span class="muted small"> escala</span></div><div class="kpi"><b>${D.worldSeries.length}</b><span class="muted small"> World Series</span></div></div>
  <div class="mlb-grid2">
    <div class="panel"><div class="panel-h"><b>World Series recentes</b><a href="#history">Histórico →</a></div>${recent.map(w => `<div class="mlb-row"><span class="mono">${w.year}</span><b>${esc(w.champion)}</b><span class="muted small">vs ${esc(w.runnerUp)}</span></div>`).join('')}</div>
    <div class="panel"><div class="panel-h"><b>Maiores rivalidades</b><a href="#rivalries">Todas →</a></div>${topRiv.map(r => `<div class="mlb-row">${logoImg(teamBy(r.a), 22)}<b>${r.a}</b><span class="muted">vs</span>${logoImg(teamBy(r.b), 22)}<b>${r.b}</b><span class="grow muted small">${esc(r.name)}</span><span class="badge">${r.score}</span></div>`).join('')}</div>
  </div>
  <div class="panel" style="margin-top:10px"><div class="panel-h"><b>Escolher franquia</b></div><div class="mlb-logo-strip">${D.teams.map(x => `<a href="#team/${x.abbr}" title="${esc(x.name)}" class="${x.abbr === t.abbr ? 'on' : ''}">${logoImg(x, 34)}</a>`).join('')}</div>
  <p class="muted small" style="margin:8px 0 0">Elencos, fotos, prospectos e draft vêm da MLB StatsAPI. Os 40 ratings fixos e 30 adaptativos são próprios do simulador — não são ratings oficiais.</p></div>`;
}

function teams() {
  setTitle('Franquias', '30 organizações · ligas, divisões, estádios');
  const divs = [...new Set(D.teams.map(t => t.division))].sort();
  content.innerHTML = `<div class="toolbar"><select id="lg"><option value="">AL + NL</option><option>AL</option><option>NL</option></select><select id="dv"><option value="">Todas divisões</option>${divs.map(d => `<option>${d}</option>`).join('')}</select></div><div class="mlb-team-grid" id="tg"></div>`;
  const draw = () => {
    const l = $('#lg').value, d = $('#dv').value;
    $('#tg').innerHTML = D.teams.filter(t => (!l || t.league === l) && (!d || t.division === d)).map(t => `<a class="panel mlb-team-card" href="#team/${t.abbr}">${logoImg(t, 54)}<div><b>${esc(t.name)}</b><div class="muted small">${t.league} ${t.division}</div><div class="muted small">${esc(t.stadium)}</div></div></a>`).join('');
  };
  $('#lg').onchange = draw; $('#dv').onchange = draw; draw();
}

async function team(abbr, tok) {
  const t = teamBy(pickTeam(abbr));
  setTitle(t.name, `${t.league} ${t.division}`);
  const titles = D.worldSeries.filter(w => w.champion === t.name).length;
  content.innerHTML = `<div class="mlb-hero panel"><div class="hero-id">${logoImg(t, 84)}<div><div class="eyebrow">${esc(t.city)}</div><h2>${esc(t.name)}</h2><div class="hero-meta"><span>${esc(t.stadium)}</span><span>${t.league} ${t.division}</span><span>${titles} World Series</span></div></div></div>
    <div class="mlb-hero-actions"><a class="btn primary" href="#roster/${t.abbr}">Elenco completo</a></div></div>
    <div class="mlb-grid2" style="margin-top:10px"><div class="panel"><div class="panel-h"><b>Destaques do elenco (OVR)</b><a href="#roster/${t.abbr}">Ver todos →</a></div><div id="teamTop" class="muted">Carregando elenco…</div></div>
    <div class="panel"><div class="panel-h"><b>Rivalidades</b></div>${D.rivalries.filter(r => r.a === t.abbr || r.b === t.abbr).map(r => { const o = teamBy(r.a === t.abbr ? r.b : r.a); return `<div class="mlb-row">${logoImg(o, 22)}<b>${esc(o.name)}</b><span class="grow muted small">${esc(r.name)}</span><span class="badge">${r.score}</span></div>`; }).join('') || '<p class="muted">Nenhuma rivalidade cadastrada.</p>'}</div></div>`;
  try {
    const r = await roster(t); if (!alive(tok)) return;
    const top = r.map(p => ({ p, o: positionalOvr(p) })).sort((a, b) => b.o - a.o).slice(0, 8);
    const el = $('#teamTop'); el.className = ''; el.innerHTML = top.map(({ p, o }) => `<div class="mlb-row clickable" data-player="${p.person?.id}">${img(photo(p.person?.id), p.person?.fullName, 'mlb-av')}<b>${esc(p.person?.fullName)}</b><span class="muted small">#${p.jerseyNumber || '—'} · ${pos(p)}</span><span class="grow"></span>${ovrBadge(o)}</div>`).join('');
    bindPlayers(el);
  } catch (e) { if (alive(tok)) $('#teamTop').innerHTML = apiError(e); }
}

function playerCard(p) {
  const per = p.person || p, id = per.id || p.id, nm = per.fullName || p.fullName || 'Atleta';
  const bt = `${per.batSide?.code || '—'}/${per.pitchHand?.code || '—'}`;
  return `<div class="panel mlb-pcard mlb-pcard-big" data-player="${p.demo ? '' : id}">${img(p.demo ? '' : photo(id), nm, 'mlb-photo xl')}<div class="mlb-pcard-body"><b>${esc(nm)}</b>
    <div class="mlb-pc-tags"><span class="mlb-num">#${esc(p.jerseyNumber || per.primaryNumber || '—')}</span><span class="chip">${esc(pos(p))}</span><span class="chip">B/T ${bt}</span></div>
    <div class="muted small">${per.currentAge ?? '—'} anos${per.height ? ` · ${esc(per.height)} · ${per.weight || '—'} lb` : ''}</div><div class="muted small">${esc(p.status?.description || (p.demo ? 'DEMO (offline)' : ''))}</div></div>${ovrBadge(positionalOvr(p))}</div>`;
}
const MLB_GROUPS = [['Pitchers', po => ['P', 'SP', 'RP', 'TWP'].includes(po)], ['Catchers', po => po === 'C'], ['Infielders', po => ['1B', '2B', '3B', 'SS', 'IF'].includes(po)], ['Outfielders', po => ['LF', 'CF', 'RF', 'OF'].includes(po)], ['DH / Utility', po => !['P', 'SP', 'RP', 'TWP', 'C', '1B', '2B', '3B', 'SS', 'IF', 'LF', 'CF', 'RF', 'OF'].includes(po)]];
function bindPlayers(scope) {
  scope.querySelectorAll('[data-player]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.player; if (!id) return; let p = { id, fullName: 'Atleta', primaryPosition: { abbreviation: '—' } };
    try { p = await person(id); } catch { /* keep minimal record */ }
    showPlayer(p);
  }));
}
function attrList(list) { return list.map(a => `<div class="mlb-attr"><span>${esc(a.name)}</span><b>${a.value}</b><i style="width:${a.value}%" class="${ovrCls(a.value)}"></i></div>`).join(''); }
function showPlayer(p) {
  const nm = p.fullName || p.person?.fullName || 'Atleta', id = p.id || p.person?.id, fx = fixedRatings(p);
  let day = 0;
  $('#modal').classList.remove('hidden');
  $('#modalContent').innerHTML = `<div class="hero-id">${img(photo(id), nm, 'mlb-photo big')}<div><div class="eyebrow">${esc(p.currentTeam?.name || '')}</div><h2>${esc(nm)}</h2>
    <div class="hero-meta"><span>#${esc(p.primaryNumber || '—')}</span><span>${esc(p.primaryPosition?.name || pos(p))}</span><span>Bats ${esc(p.batSide?.code || '—')}</span><span>Throws ${esc(p.pitchHand?.code || '—')}</span><span>${p.currentAge ?? '—'} anos</span><span>${esc(p.height || '—')} · ${p.weight || '—'} lb</span></div></div><span class="grow"></span>${ovrBadge(positionalOvr(p, fx), true)}</div>
    <div class="sec-h">40 atributos fixos</div><div class="mlb-attr-grid">${attrList(fx)}</div>
    <div class="sec-h" style="display:flex;align-items:center;gap:10px">30 atributos adaptativos (contexto do dia) <button id="reroll" class="small">Atualizar contexto do dia</button></div>
    <div class="mlb-attr-grid" id="adapt">${attrList(adaptiveRatings(p, 'initial'))}</div>
    <p class="muted small">Ratings próprios do simulador (determinísticos). Dados biográficos e foto: MLB.</p>`;
  $('#reroll').onclick = () => { day++; $('#adapt').innerHTML = attrList(adaptiveRatings(p, 'day' + day)); };
}

async function rosterView(abbr, tok) {
  const cur = pickTeam(abbr || lastTeam), t = teamBy(cur);
  setTitle('Elencos', 'Active roster 2026 · fotos · 40 + 30 atributos');
  content.innerHTML = `<div class="toolbar"><select id="teamSel">${teamOpts(cur)}</select><input id="q" placeholder="Buscar jogador"></div><div id="area" class="muted">Carregando elenco…</div>`;
  let data = [];
  const draw = () => {
    const q = $('#q').value.toLowerCase(); const a = $('#area'); a.className = '';
    const list = data.filter(p => (p.person?.fullName || '').toLowerCase().includes(q)).sort((x, y) => positionalOvr(y) - positionalOvr(x));
    const note = data.some(p => p.demo) ? '<p class="bad small">Elenco DEMO: a MLB StatsAPI não respondeu (sem internet ou bloqueio). Nenhum nome ou foto é inventado.</p>' : '';
    a.innerHTML = note + (MLB_GROUPS.map(([label, f]) => { const g = list.filter(p => f(pos(p))); return g.length ? `<div class="sec-h">${label} · ${g.length}</div><div class="mlb-player-grid">${g.map(playerCard).join('')}</div>` : ''; }).join('') || '<p class="muted">Nenhum jogador.</p>');
    bindPlayers(a);
  };
  $('#teamSel').onchange = e => { location.hash = `#roster/${e.target.value}`; };
  $('#q').oninput = () => { if (data.length) draw(); };
  try { data = await roster(t); } catch { data = demoRoster(t); }
  if (alive(tok)) draw();
}

async function prospectsView(_, tok) {
  setTitle('Prospectos', 'Banco de prospects ligado ao Draft (StatsAPI)');
  content.innerHTML = `<div id="area" class="muted">Carregando prospectos…</div>`;
  try {
    const r = await prospects(); if (!alive(tok)) return;
    const a = $('#area'); a.className = 'mlb-player-grid';
    a.innerHTML = r.slice(0, 150).map((p, i) => {
      const nm = p.person?.fullName || p.fullName || p.person?.name || 'Prospect';
      const id = p.person?.id || p.playerId || p.bisPlayerId || hash(nm);
      return `<div class="panel mlb-pcard"><span class="mlb-rank">${p.rank || i + 1}</span>${img(p.headshotLink || photo(id), nm, 'mlb-photo')}<div class="mlb-pcard-body"><b>${esc(nm)}</b><div class="muted small">${esc(p.position?.abbreviation || p.position?.name || '—')}</div><div class="muted small">${esc(p.school?.name || '—')}</div></div></div>`;
    }).join('') || '<p class="muted">Nenhum prospect retornado.</p>';
  } catch (e) { if (alive(tok)) $('#area').innerHTML = apiError(e); }
}

async function draftView(year, tok) {
  const y = Math.min(2026, Math.max(1965, Number(year) || 2026));
  setTitle('Draft', `Resultados reais por ano · ${y}`);
  content.innerHTML = `<div class="toolbar"><input id="yr" class="num" type="number" min="1965" max="2026" value="${y}"><button id="go" class="primary">Carregar Draft</button></div><div id="area" class="muted">Carregando Draft ${y}…</div>`;
  $('#go').onclick = () => { location.hash = `#draft/${$('#yr').value}`; };
  try {
    const r = await draft(y); if (!alive(tok)) return;
    const a = $('#area'); a.className = 'table-wrap';
    a.innerHTML = `<table class="table compact"><thead><tr><th>Pick</th><th>Round</th><th>Time</th><th>Jogador</th><th>Pos.</th><th>Escola</th><th>Rank</th></tr></thead><tbody>${r.map(p => `<tr><td>#${p.pickNumber || '—'}</td><td>${p.pickRound || p.round || '—'}</td><td>${esc(p.team?.name || '—')}</td><td>${esc(p.person?.fullName || '—')}</td><td>${esc(p.position?.abbreviation || '—')}</td><td>${esc(p.school?.name || '—')}</td><td>${p.rank || '—'}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) { if (alive(tok)) $('#area').innerHTML = apiError(e); }
}

function stadiums() {
  setTitle('Estádios', `Os ${D.teams.length} ballparks da MLB em 2026`);
  content.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Franquia</th><th>Estádio</th><th>Cidade</th><th>Liga</th><th>Divisão</th></tr></thead><tbody>${D.teams.map(t => `<tr><td><a href="#team/${t.abbr}" class="player-cell">${logoImg(t, 26)}${esc(t.name)}</a></td><td>${esc(t.stadium)}</td><td>${esc(t.city)}</td><td>${t.league}</td><td>${t.division}</td></tr>`).join('')}</tbody></table></div>`;
}

function rivalries() {
  setTitle('Rivalidades', 'Rivalry Score inicial (0–100)');
  content.innerHTML = `<div class="mlb-team-grid">${[...D.rivalries].sort((a, b) => b.score - a.score).map(r => { const a = teamBy(r.a), b = teamBy(r.b); return `<div class="panel"><div class="mlb-row">${logoImg(a, 34)}<b>${a.abbr}</b><span class="muted">vs</span><b>${b.abbr}</b>${logoImg(b, 34)}<span class="grow"></span><span class="badge">${r.score}</span></div><div class="muted small">${esc(r.name)}</div><div class="mlb-bar"><i style="width:${r.score}%"></i></div></div>`; }).join('')}</div>`;
}

function history() {
  setTitle('Histórico', `World Series · ${D.worldSeries[0].year}–${D.worldSeries.at(-1).year}`);
  const tally = {}; D.worldSeries.forEach(w => { if (w.champion) tally[w.champion] = (tally[w.champion] || 0) + 1; });
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10);
  content.innerHTML = `<div class="mlb-grid2"><div class="panel"><div class="panel-h"><b>Campeões e vices</b></div><div class="table-wrap" style="max-height:70vh"><table class="table compact"><thead><tr><th>Ano</th><th>Campeão</th><th>Vice</th></tr></thead><tbody>${[...D.worldSeries].reverse().map(w => `<tr><td class="mono">${w.year}</td><td>${esc(w.champion)}</td><td>${esc(w.runnerUp)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="panel"><div class="panel-h"><b>Mais títulos</b></div>${top.map(([n, v]) => `<div class="mlb-row"><b>${esc(n)}</b><span class="grow"></span><span class="badge">${v}</span></div>`).join('')}</div></div>`;
}

function diamond() {
  setTitle('Partida 2D', 'Ballpark 2D · câmeras Broadcast / Batter / Pitcher / Tactical / Full');
  cleanup = mountMatch(content, matchDeps());
}
// Extension point: later phases (engine, commentary, audio, crowd) register here without touching the view.
export const matchHooks = [];
function matchDeps() { return matchHooks.reduce((d, h) => h(d) || d, {}); }

// ---------- router ----------
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  $('#modal').classList.add('hidden');
  const tok = ++routeToken;
  const [view, arg] = (location.hash.slice(1) || 'home').split('/');
  const map = { home, teams, team, roster: rosterView, prospects: prospectsView, draft: draftView, stadiums, rivalries, history, diamond };
  renderNav(view === 'team' ? 'teams' : map[view] ? view : 'home');
  (map[view] || home)(arg, tok);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// Logo fallback: a logo that fails to load becomes a team-abbreviation badge of the same size.
document.addEventListener('error', e => {
  const el = e.target;
  if (!(el instanceof HTMLImageElement) || !el.classList.contains('logo')) return;
  const b = document.createElement('span');
  b.className = 'mlb-logo-fb'; b.textContent = (el.alt || '').slice(0, 3) || '?';
  const w = el.getAttribute('width') || 34; b.style.width = b.style.height = w + 'px'; b.style.fontSize = Math.max(8, w * 0.3) + 'px';
  el.replaceWith(b);
}, true);
$('#closeModal').onclick = () => $('#modal').classList.add('hidden');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#modal').classList.add('hidden'); });
$('#syncAll').onclick = async () => {
  const s = $('#sourcePill'); s.textContent = 'Sincronizando…';
  for (const t of D.teams) { try { await roster(t); s.textContent = `${cachedRosterCount()}/${D.teams.length} rosters`; } catch { /* keep going */ } }
  s.textContent = `${cachedRosterCount()}/${D.teams.length} rosters em cache da sessão`;
};
route();
