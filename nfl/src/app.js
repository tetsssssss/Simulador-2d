// NFL Universe 2D — app shell: global state, hash routing, settings/save persistence, career glue.
// Screens live in src/ui/views/*; the 2D match in src/ui/gameView.js; the engine in src/sim/* (untouched by the UI).
import { fetchRoster, parseCSV, normalizePlayer } from './dataService.js';
import { mountGame } from './ui/gameView.js';
import { createSaveManager } from './core/saveManager.js';
import { defaultSettings, sanitizeSettings, engineTuning } from './core/gameplaySettings.js';
import { createCareer, normalizeCareer, completeWeek, nextGame } from './game/career.js';
import { simulateGame } from './game/match.js';
import { esc, displayPrefs } from './ui/components.js';
import { TEAM_COLORS } from './ui/teamColors.js';
import { homeView } from './ui/views/home.js';
import { rosterView } from './ui/views/roster.js';
import { playerView } from './ui/views/player.js';
import { settingsView } from './ui/views/settings.js';
import { careerView } from './ui/views/career.js';
import { franchisesView, collegesView, tradesView, medicalView, rivalriesView, championsView, dataView } from './ui/views/misc.js';

const sm = createSaveManager();
const state = {
  teams: [], champions: [], roster: [], route: { view: 'home', arg: '' },
  settings: sanitizeSettings(sm.loadSettings() || defaultSettings()),
  career: null, slot: null, match: null, setup: null, ui: {},
};
window.__asu = state; // debug/test hook

const NAV = [
  ['', [['home', 'Home', '⌂']]],
  ['JOGAR', [['play', 'Partida 2D', '▶'], ['career', 'Carreira & Saves', '★']]],
  ['TIME', [['roster', 'Roster', '☰'], ['depth', 'Depth Chart', '⇅'], ['franchises', 'Franquias', '⛨']]],
  ['GESTÃO', [['trades', 'Trades', '⇄'], ['medical', 'Médico', '✚']]],
  ['LIGA', [['rivalries', 'Rivalidades', '⚔'], ['champions', 'Campeões', '🏆'], ['colleges', 'Colleges', '🎓']]],
  ['SISTEMA', [['settings', 'Settings', '⚙'], ['data', 'Dados & Fotos', '⛁']]],
];
const TITLES = { home: 'Home', play: 'Partida 2D', career: 'Carreira & Saves', roster: 'Roster', depth: 'Depth Chart', player: 'Perfil do atleta', franchises: 'Franquias', trades: 'Trade Center', medical: 'Departamento Médico', rivalries: 'Rivalidades', champions: 'Campeões', colleges: 'College Explorer', settings: 'Settings', data: 'Dados & Fotos' };

const $ = s => document.querySelector(s);
const content = $('#content');

function toast(t, kind = '') { const el = $('#toast'); el.textContent = t; el.className = `toast show ${kind}`; clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), 2800); }
function teamBy(a) { return state.teams.find(t => t.abbr === a) || state.teams[0]; }
function navigate(view, arg = '') { const h = `#${view}${arg ? '/' + encodeURIComponent(arg) : ''}`; if (location.hash === h) render(); else location.hash = h; }
function setTitle(a, b = '') { $('#pageTitle').textContent = a; $('#pageSub').textContent = b; }
function sourceStatus(t) { $('#sourcePill').textContent = t; }

// ---------- settings & saves ----------
function applyDisplay() { displayPrefs.photos = state.settings.display.photos !== false; }
function saveSettings() { sm.saveSettings(state.settings); applyDisplay(); if (state.career && state.settings.save.autosave) autosave(true); }
function autosave(silent = false) {
  if (!state.career) return;
  if (!state.slot) { state.slot = sm.firstFreeSlot(); if (!state.slot) { if (!silent) toast('Todos os slots ocupados — escolha um em Carreira & Saves'); return; } }
  sm.save(state.slot, state.career, state.settings);
  drawSavePill();
  if (!silent) toast(`Salvo no slot ${state.slot}`);
}
function loadSlot(i) {
  const r = sm.load(i);
  if (r.status !== 'ok') { toast(r.status === 'corrupt' ? `Slot ${i} corrompido: ${r.error}` : 'Slot vazio', 'bad'); return false; }
  state.career = normalizeCareer(r.save.career, state.teams);
  state.slot = i; sm.setActive(i);
  if (r.save.settings) { state.settings = sanitizeSettings(r.save.settings); sm.saveSettings(state.settings); applyDisplay(); }
  state.match = null; drawSavePill();
  return true;
}
function newCareer({ team, name, slot }) {
  state.career = createCareer({ team, name, teams: state.teams });
  state.slot = slot || sm.firstFreeSlot() || 1;
  sm.save(state.slot, state.career, state.settings);
  state.match = null; drawSavePill();
}
function closeCareer() { state.career = null; state.slot = null; sm.setActive(null); state.match = null; drawSavePill(); }
function drawSavePill() {
  const c = state.career;
  $('#savePill').innerHTML = c ? `<span class="dot ok"></span><b>${esc(c.name)}</b><small>${esc(c.team)} · ${c.wins}-${c.losses}${c.ties ? '-' + c.ties : ''} · S${state.slot || '—'}</small>` : '<span class="dot"></span><small>Sem carreira ativa</small>';
}

// ---------- career glue ----------
const careerRoster = roster => {
  const out = new Set((state.career?.injuries || []).filter(i => i.weeks > 0).map(i => i.id || i.name));
  return out.size ? roster.filter(p => !out.has(p.gsis_id || p.full_name) && !out.has(p.full_name)) : roster;
};
function finishCareerGame(g) {
  const c = state.career;
  if (!c || !nextGame(c)) return null;
  const wk = completeWeek(c, state.teams, state.roster, g, state.settings.gameplay);
  if (state.settings.save.autosave) autosave(true);
  drawSavePill();
  toast(`Semana ${wk.week}: ${wk.result.w} ${wk.result.us}-${wk.result.them} vs ${wk.opp}`, wk.result.w === 'W' ? 'good' : 'bad');
  return wk;
}
async function simCareerGame({ home, away, seed, quarterMin }) {
  const g = await simulateGame({ roster: careerRoster(state.roster), home, away, seed, quarterMin, tuning: engineTuning(state.settings.gameplay) });
  finishCareerGame(g);
  return g;
}

const ctx = {
  state, content, sm, toast, teamBy, navigate, setTitle, esc, render, autosave, loadSlot, newCareer, closeCareer, saveSettings, sync,
  simCareerGame, finishCareerGame, careerRoster,
};

// ---------- routing ----------
function parseHash() {
  const [view, ...rest] = location.hash.replace(/^#/, '').split('/');
  return { view: TITLES[view] ? view : 'home', arg: decodeURIComponent(rest.join('/') || '') };
}
function renderNav() {
  const cur = state.route.view === 'player' ? 'roster' : state.route.view;
  $('#nav').innerHTML = NAV.map(([sec, items]) => `${sec ? `<div class="nav-sec">${sec}</div>` : ''}${items.map(([k, l, ic]) => `<a class="nav-btn ${cur === k ? 'active' : ''}" href="#${k}"><span class="nav-ic">${ic}</span>${l}${k === 'play' && state.match && !state.match.g?.over ? '<span class="live">LIVE</span>' : ''}</a>`).join('')}`).join('');
}
function render() {
  if (!state.teams.length) return;
  state.route = parseHash();
  renderNav();
  const v = state.route.view;
  document.body.dataset.view = v;
  setTitle(TITLES[v] || 'Home');
  content.className = `content v-${v}`;
  const views = {
    home: homeView, roster: c => rosterView(c, 'roster'), depth: c => rosterView(c, 'depth'), player: playerView, settings: settingsView, career: careerView,
    franchises: franchisesView, colleges: collegesView, trades: tradesView, medical: medicalView, rivalries: rivalriesView, champions: championsView, data: dataView,
    play: () => {
      setTitle('Partida 2D', 'Simulação 11×11 · motor físico 30 Hz · resultado emergente');
      mountGame(content, {
        state, teamBy, toast, navigate,
        settings: () => state.settings, tuning: () => engineTuning(state.settings.gameplay),
        career: () => state.career, careerNext: () => (state.career ? nextGame(state.career) : null), careerRoster,
        simCareerGame,
        onGameOver: m => { if (m.mode === 'CAREER' && !m.recorded) { m.recorded = true; finishCareerGame(m.g); } renderNav(); },
      });
    },
  };
  (views[v] || homeView)(ctx, state.route.arg);
  content.scrollTop = 0;
}

// ---------- data ----------
async function loadStatic() {
  [state.teams, state.champions] = await Promise.all([fetch('data/teams.json').then(r => r.json()), fetch('data/champions.json').then(r => r.json())]);
  for (const t of state.teams) t.color = TEAM_COLORS[t.abbr] || '#24364d';
  const cached = localStorage.getItem('asu_roster_2026');
  if (cached) { try { state.roster = JSON.parse(cached); sourceStatus(`${state.roster.length.toLocaleString('pt-BR')} atletas · cache`); } catch { /* re-sync below */ } }
  // Saves: legacy migration (asu_career → slot), then the active slot.
  const mig = sm.migrateLegacy();
  if (mig) setTimeout(() => toast(`Save antigo migrado para o slot ${mig.slot} (versão ${mig.save.version})`), 600);
  const act = sm.activeSlot();
  if (act) loadSlot(act);
  applyDisplay(); drawSavePill(); render();
}
async function sync() {
  sourceStatus('sincronizando…');
  try {
    state.roster = await fetchRoster();
    localStorage.setItem('asu_roster_2026', JSON.stringify(state.roster));
    sourceStatus(`${state.roster.length.toLocaleString('pt-BR')} atletas · ${state.roster.source || 'nflverse'}`);
    toast('Roster 2026 sincronizado'); render();
  } catch { sourceStatus('falha de rede · importe o CSV'); toast('Não consegui acessar o feed. Use o importador CSV em Dados & Fotos.', 'bad'); }
}

$('#saveBtn').onclick = () => (state.career ? autosave() : navigate('career'));
$('#csvFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  const rows = parseCSV(await f.text()).map(normalizePlayer).filter(p => p.full_name && p.team);
  if (rows.length < 100) { toast('CSV parece incompleto', 'bad'); return; }
  state.roster = rows; localStorage.setItem('asu_roster_2026', JSON.stringify(rows));
  sourceStatus(`${rows.length} atletas · CSV local`); toast('CSV importado'); render();
});
window.addEventListener('hashchange', render);
loadStatic().then(() => { if (!state.roster.length) sync(); });
