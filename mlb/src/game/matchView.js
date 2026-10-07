// MLB Partida 2D view: mount(root, deps) → dispose(). One rAF loop and no window listeners; all released on dispose.
// Phase B: real lineups (StatsAPI) or a labelled DEMO roster offline, defense set + batter at the plate.
// Phase F plugs the BaseballSimulationEngine through deps.createEngine.
import { D, teamBy, roster } from '../mlbData.js';
import { mlbColor } from '../teamColors.js';
import { buildLineup, demoRoster } from './lineup.js';
import { createFieldRenderer, CAMERAS } from '../field/fieldRenderer.js';
import { DEF_SPOTS, BATTER_SPOT } from '../field/geometry.js';
import { photoUrl } from '../photos.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };

export async function loadTeam(abbr) {
  const t = teamBy(abbr);
  let entries, source = 'api';
  try { entries = await roster(t); if (!entries.length) throw new Error('vazio'); } catch { entries = demoRoster(t); source = 'demo'; }
  const lineup = buildLineup(entries, '');
  return { abbr, name: t.name, color: mlbColor(abbr), color2: mlbColor(abbr, 1), lineup, source };
}
export function withSide(team, side) {
  const fix = r => r && ({ ...r, id: `${side}-${r.pid}`, team: side });
  const L = team.lineup;
  return { ...team, lineup: { ...L, order: L.order.map(fix), field: Object.fromEntries(Object.entries(L.field).map(([k, v]) => [k, fix(v)])), sp: fix(L.sp), bullpen: L.bullpen.map(fix) } };
}

export function mountMatch(root, deps = {}) {
  const pref = { home: store.get('asu_mlb_home') || 'NYY', away: store.get('asu_mlb_away') || 'BOS', camera: store.get('asu_mlb_cam') || 'BROADCAST', names: store.get('asu_mlb_names') !== '0', photos: store.get('asu_mlb_photos') !== '0', debug: false };
  const view = { raf: 0, disposed: false, state: null, engine: null, selected: null, last: 0 };
  const teamOpts = sel => D.teams.map(t => `<option value="${t.abbr}" ${t.abbr === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  root.innerHTML = `<div class="mlb-match">
    <div class="toolbar mlb-setup"><select id="awaySel">${teamOpts(pref.away)}</select><span class="muted">@</span><select id="homeSel">${teamOpts(pref.home)}</select><span class="grow"></span><span class="muted small" id="srcNote"></span></div>
    <div class="mlb-bug" id="bug"></div>
    <div class="mlb-match-grid">
      <div class="mlb-field-col"><div class="mlb-field-wrap2"><canvas id="fieldCanvas"></canvas><div class="mlb-pcard2" id="pcard"></div><div class="mlb-pitchinfo" id="pitchInfo"></div></div>
        <div class="controls mlb-controls" id="controls">
          <div class="seg" id="camSeg">${Object.entries(CAMERAS).map(([k, c]) => `<button data-cam="${k}" class="${k === pref.camera ? 'on' : ''}">${c.label}</button>`).join('')}</div>
          <span class="grow" id="ctrlExtra"></span>
          <label class="chk"><input type="checkbox" id="optNames" ${pref.names ? 'checked' : ''}> Nomes</label>
          <label class="chk"><input type="checkbox" id="optPhotos" ${pref.photos ? 'checked' : ''}> Fotos</label>
          <label class="chk"><input type="checkbox" id="optDebug"> Debug</label>
        </div></div>
      <aside class="mlb-side" id="side"></aside>
    </div></div>`;
  const $ = s => root.querySelector(s);
  const canvas = $('#fieldCanvas');
  const renderer = createFieldRenderer(canvas, deps);
  renderer.setCamera(pref.camera);

  function staticState(home, away) {
    const fielders = Object.entries(home.lineup.field).map(([k, f]) => ({ ...f, ...DEF_SPOTS[k] }));
    if (home.lineup.sp) fielders.push({ ...home.lineup.sp, ...DEF_SPOTS.P });
    const b = away.lineup.order[0];
    return { t: 0, home, away, fielders, batter: b && { ...b, ...BATTER_SPOT(b.bats) }, runners: [], ball: null, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0, score: { home: 0, away: 0 }, hits: { home: 0, away: 0 }, errors: { home: 0, away: 0 }, events: [] };
  }

  async function setup() {
    $('#bug').innerHTML = '<div class="muted" style="padding:10px">Carregando elencos…</div>';
    const [h, a] = await Promise.all([loadTeam(pref.home), loadTeam(pref.away)]);
    if (view.disposed) return;
    const home = withSide(h, 'home'), away = withSide(a, 'away');
    $('#srcNote').innerHTML = [h, a].some(t => t.source === 'demo') ? '<span class="bad">Elenco DEMO (MLB StatsAPI indisponível) — sem nomes/fotos reais</span>' : 'Elencos: MLB StatsAPI (2026)';
    if (deps.createEngine) { view.engine = deps.createEngine({ home, away, seed: `${pref.away}@${pref.home}` }); view.state = view.engine.state; }
    else view.state = staticState(home, away);
    drawBug(); drawSide();
  }

  function drawBug() {
    const s = view.state; if (!s) return;
    const bat = s.half === 'top' ? 'away' : 'home';
    const row = k => `<div class="mb-row ${bat === k ? 'batting' : ''}" style="--tc:${s[k].color}"><b>${esc(s[k].abbr)}</b><span class="mb-r">${s.score[k]}</span><span class="mb-h">${s.hits[k]}</span><span class="mb-e">${s.errors[k]}</span></div>`;
    const occ = n => (s.runners || []).some(r => r.base === n) ? 'on' : '';
    $('#bug').innerHTML = `<div class="mb-teams"><div class="mb-head"><span></span><span>R</span><span>H</span><span>E</span></div>${row('away')}${row('home')}</div>
      <div class="mb-inning"><b>${s.half === 'top' ? '▲' : '▼'} ${s.inning}</b><small>${s.half === 'top' ? 'TOP' : 'BOTTOM'}</small></div>
      <div class="mb-diamond"><i class="b2 ${occ(2)}"></i><i class="b3 ${occ(3)}"></i><i class="b1 ${occ(1)}"></i></div>
      <div class="mb-count"><span>BALLS <b>${s.balls}</b></span><span>STRIKES <b>${s.strikes}</b></span><span>OUTS <b>${'●'.repeat(s.outs)}${'○'.repeat(Math.max(0, 3 - s.outs))}</b></span></div>`;
  }

  function drawSide() {
    const s = view.state; if (!s) return;
    const fieldTeam = s.half === 'top' ? 'home' : 'away';
    const pitcher = (s.fielders || []).find(f => f.pos === 'P'), batter = s.batter;
    const card = (e, role) => e ? `<div class="mlb-matchcard"><img src="${esc(photoUrl(e.p))}" alt="" onerror="this.style.visibility='hidden'"><div><small class="muted">${role}</small><b>${esc(e.name)}</b><div class="muted small">#${esc(e.num)} · ${esc(e.pos)} · ${role === 'PITCHER' ? 'Throws ' + e.throws : 'Bats ' + e.bats}</div>${deps.cardExtra ? deps.cardExtra(e, role, s) : ''}</div></div>` : '';
    const order = s[s.half === 'top' ? 'away' : 'home'].lineup.order;
    $('#side').innerHTML = `<div class="panel">${card(pitcher, 'PITCHER')}${card(batter, 'BATTER')}</div>
      <div class="panel"><div class="panel-h"><b>Lineup ${esc(s[s.half === 'top' ? 'away' : 'home'].abbr)}</b></div>${order.map((o, i) => `<div class="mlb-lu ${batter && o.pid === batter.pid ? 'now' : ''}"><span>${i + 1}</span><b>${esc(o.last)}</b><small>${esc(o.pos)}</small></div>`).join('')}</div>
      <div class="panel"><div class="panel-h"><b>Defesa ${esc(s[fieldTeam].abbr)}</b></div>${(s.fielders || []).map(f => `<div class="mlb-lu"><span>${esc(f.pos)}</span><b>${esc(f.last)}</b><small>#${esc(f.num)}</small></div>`).join('')}</div>` + (deps.sidePanels ? deps.sidePanels(s) : '');
  }

  function frame(ts) {
    if (view.disposed || !canvas.isConnected) { dispose(); return; }
    const dt = view.last ? Math.min(0.1, (ts - view.last) / 1000) : 0; view.last = ts;
    let alpha = 1;
    if (view.engine) { alpha = view.engine.advance(dt); view.state = view.engine.state; }
    if (view.state) renderer.render(view.state, alpha, { camera: pref.camera, cameraTarget: view.engine?.cameraTarget?.(pref.camera), showNames: pref.names, showPhotos: pref.photos, debug: pref.debug, selected: view.selected, drawDebug: deps.drawDebug });
    if (deps.onFrame) deps.onFrame(view, dt);
    view.raf = requestAnimationFrame(frame);
  }

  $('#camSeg').onclick = e => { const k = e.target.dataset.cam; if (!k) return; pref.camera = k; store.set('asu_mlb_cam', k); root.querySelectorAll('#camSeg button').forEach(b => b.classList.toggle('on', b.dataset.cam === k)); };
  $('#optNames').onchange = e => { pref.names = e.target.checked; store.set('asu_mlb_names', pref.names ? '1' : '0'); };
  $('#optPhotos').onchange = e => { pref.photos = e.target.checked; store.set('asu_mlb_photos', pref.photos ? '1' : '0'); };
  $('#optDebug').onchange = e => { pref.debug = e.target.checked; };
  $('#homeSel').onchange = e => { pref.home = e.target.value; store.set('asu_mlb_home', pref.home); restart(); };
  $('#awaySel').onchange = e => { pref.away = e.target.value; store.set('asu_mlb_away', pref.away); restart(); };
  canvas.addEventListener('click', ev => {
    const r = canvas.getBoundingClientRect(); const e = renderer.pick(ev.clientX - r.left, ev.clientY - r.top);
    view.selected = e && view.selected !== e.id ? e.id : null;
    const el = $('#pcard');
    if (!view.selected) { el.classList.remove('show'); return; }
    el.innerHTML = `<img src="${esc(photoUrl(e.p))}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(e.name)}</b><div class="muted small">#${esc(e.num)} · ${esc(e.pos)} · B/T ${e.bats}/${e.throws}</div></div>`;
    el.classList.add('show');
  });
  function restart() { view.engine?.dispose?.(); view.engine = null; view.state = null; setup().catch(err => { $('#bug').innerHTML = `<div class="mlb-notice bad">${esc(err.message)}</div>`; }); }
  function dispose() {
    if (view.disposed) return;
    view.disposed = true; cancelAnimationFrame(view.raf); renderer.dispose(); view.engine?.dispose?.();
    window.__mlbLoops = Math.max(0, (window.__mlbLoops || 1) - 1);
  }
  window.__mlbLoops = (window.__mlbLoops || 0) + 1;
  restart();
  view.raf = requestAnimationFrame(frame);
  view.redraw = () => { drawBug(); drawSide(); };
  view.$ = $;
  window.__mlbMatch = view;
  return dispose;
}
