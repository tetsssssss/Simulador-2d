// NHL Partida 2D view: mount(root, deps) → dispose(). One rAF loop, one keydown listener, both released on dispose.
// Phase B: real lineups at the opening faceoff (cameras/visual). Phase F plugs the HockeySimulationEngine in `engine`.
import { D, teamBy, getRoster, rosterSource } from '../nhlData.js';
import { nhlColor } from '../teamColors.js';
import { buildLineup, faceoffSpots, skaterRecord } from './lineup.js';
import { createRinkRenderer, CAMERAS } from '../rink/rinkRenderer.js';
import { RINK, MIDY } from '../rink/geometry.js';
import { photoUrl } from '../photos.js';
import { separateKits, textColorOn } from '../../../core/render/sprites.js';
import { createPresentation } from '../../../core/presentation/presentationEngine.js';
import { createCommentary } from '../../../core/commentary/commentaryEngine.js';
import { mountCommentaryPanel } from '../../../core/commentary/commentaryPanel.js';
import { mountEngineControls } from '../../../core/ui/engineControls.js';
import { readPending, writeResult, goTo } from '../../../core/career/bridge.js';
import { nhlLinesFromState } from '../career/nhlSpec.js';
import { createAtmosphere } from '../../../core/presentation/atmosphere.js';
import { getAudio } from '../../../core/audio/audioEngine.js';
import { NHL_ATMOSPHERE, nhlStands } from '../presentation/atmosphere.js';
import { NHL_COMMENTARY } from '../presentation/commentary.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };

export function mountMatch(root, deps = {}) {
  const pref = { home: store.get('asu_nhl_home') || 'BOS', away: store.get('asu_nhl_away') || 'TOR', camera: store.get('asu_nhl_cam') || 'BROADCAST', names: store.get('asu_nhl_names') !== '0', photos: store.get('asu_nhl_photos') !== '0', debug: false };
  const view = { raf: 0, disposed: false, state: null, selected: null, renderer: null, engine: null, last: 0 };
  const teamOpts = sel => D.teams.map(t => `<option value="${t.abbr}" ${t.abbr === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  root.innerHTML = `<div class="nhl-match">
    <div class="nhl-setup toolbar"><select id="awaySel">${teamOpts(pref.away)}</select><span class="muted">@</span><select id="homeSel">${teamOpts(pref.home)}</select>
      <span class="grow"></span><span class="muted small" id="srcNote"></span></div>
    <div class="nhl-bug" id="bug"></div>
    <div class="nhl-match-grid">
      <div class="nhl-ice-col"><div class="nhl-ice-wrap"><canvas id="rinkCanvas"></canvas><div class="nhl-pcard" id="pcard"></div><div class="evt-flash" id="evtFlash"></div></div>
        <div class="controls nhl-controls" id="controls">
          <div class="seg" id="camSeg">${Object.entries(CAMERAS).map(([k, c]) => `<button data-cam="${k}" class="${k === pref.camera ? 'on' : ''}">${c.label}</button>`).join('')}</div>
          <span id="ctrlExtra" class="ctrl-extra"></span><span class="grow"></span>
          <label class="chk"><input type="checkbox" id="optNames" ${pref.names ? 'checked' : ''}> Nomes</label>
          <label class="chk"><input type="checkbox" id="optPhotos" ${pref.photos ? 'checked' : ''}> Fotos</label>
          <label class="chk"><input type="checkbox" id="optDebug"> Rotas/Debug</label>
        </div>
      </div>
      <aside class="nhl-side"><div id="liveComm"></div><div id="side"></div></aside>
    </div></div>`;
  const $ = s => root.querySelector(s);
  const canvas = $('#rinkCanvas');
  const audio = getAudio();
  // crowd stands: a stable proxy for the renderer, the real stands are rebuilt when the teams change
  const stands = { cur: null, draw: (c, a) => stands.cur?.draw(c, a), setIntensity: v => stands.cur?.setIntensity(v) };
  const renderer = view.renderer = createRinkRenderer(canvas, { ...deps, crowd: deps.crowd || stands });
  renderer.setCamera(pref.camera);

  const pend = readPending('nhl'); // career game handed over by the Career Hub
  view.pending = pend;
  async function setup() {
    $('#bug').innerHTML = '<div class="muted" style="padding:10px">Carregando elencos…</div>';
    if (pend) { pref.home = pend.h; pref.away = pend.a; $('#homeSel').value = pend.h; $('#awaySel').value = pend.a; }
    const [hr, ar] = pend ? [pend.rosters.home, pend.rosters.away] : await Promise.all([getRoster(pref.home), getRoster(pref.away)]);
    if (view.disposed) return;
    const [hk, ak] = separateKits([nhlColor(pref.home), nhlColor(pref.home, 1)], [nhlColor(pref.away), nhlColor(pref.away, 1)]);
    const home = { abbr: pref.home, name: teamBy(pref.home).name, brand: nhlColor(pref.home), color: hk[0], color2: hk[1], lineup: buildLineup(hr) };
    const away = { abbr: pref.away, name: teamBy(pref.away).name, brand: nhlColor(pref.away), color: ak[0], color2: ak[1], lineup: buildLineup(ar) };
    const src = [rosterSource(pref.home), rosterSource(pref.away)];
    $('#srcNote').textContent = pend ? `★ Jogo da carreira “${pend.careerName}” — o resultado volta para o Career Hub` : src.includes('snapshot') ? 'Elencos: snapshot local 2023-24 (NHL API indisponível)' : 'Elencos: NHL Web API';
    if (deps.createEngine) {
      view.engine = deps.createEngine({ home, away, seed: pend ? pend.seed : `${pref.away}@${pref.home}#${view.seedN || 0}` });
      if (pend) { $('#homeSel').disabled = true; $('#awaySel').disabled = true; }
      view.state = view.engine.state;
    } else view.state = faceoffState(home, away);
    startPresentation(`${pref.away}@${pref.home}`);
    drawBug(); drawSide();
  }

  // Opening faceoff (static) — used until/unless an engine drives the state.
  function faceoffState(home, away) {
    const players = [];
    for (const [side, team, dir] of [['home', home, 1], ['away', away, -1]]) {
      const spots = faceoffSpots(dir), L = team.lineup.lines[0], P = team.lineup.pairs[0], G = team.lineup.goalies[0];
      const slots = { C: L.C, LW: L.LW, RW: L.RW, LD: P.LD, RD: P.RD, G };
      for (const [slot, p] of Object.entries(slots)) {
        if (!p) continue;
        const r = skaterRecord(p, slot, side), sp = spots[slot];
        r.x = sp.x; r.y = sp.y; r.facing = dir > 0 ? 0 : Math.PI;
        players.push(r);
      }
    }
    return { t: 0, players, puck: { x: RINK.center, y: MIDY, z: 0, vx: 0, vy: 0, owner: null }, home, away, attack: { home: 1, away: -1 }, possession: null, period: 1, clock: 1200, score: { home: 0, away: 0 }, shots: { home: 0, away: 0 }, events: [] };
  }

  function drawBug() {
    const s = view.state; if (!s) return;
    const side = (k, right) => { const T = s[k]; return `<div class="nb-team ${right ? 'right' : ''} ${s.possession === k ? 'has-puck' : ''}" style="--tc:${T.brand || T.color}"><b>${esc(T.abbr)}</b><small>${esc(T.name.split(' ').slice(-1)[0])}</small><span class="nb-score">${s.score[k]}</span><span class="nb-sog">SOG ${s.shots[k]}</span></div>`; };
    const mm = Math.floor(s.clock / 60), ss = String(Math.floor(s.clock % 60)).padStart(2, '0');
    $('#bug').innerHTML = `${side('away', false)}<div class="nb-mid"><b>${['1st', '2nd', '3rd', 'OT'][Math.min(3, s.period - 1)]}</b><span>${mm}:${ss}</span>${s.strength ? `<em>${esc(s.strength)}</em>` : ''}</div>${side('home', true)}`;
  }

  function drawSide() {
    const s = view.state; if (!s) return;
    const onIce = k => s.players.filter(p => p.team === k);
    const row = p => `<div class="nhl-onice" data-pid="${esc(p.id)}"><img src="${esc(photoUrl(p.p))}" alt="" onerror="this.style.visibility='hidden'"><span class="no-num" style="background:${s[p.team].color};color:${textColorOn(s[p.team].color)};box-shadow:inset 0 0 0 1px ${s[p.team].color2 || 'transparent'}">${esc(p.num)}</span><b>${esc(p.last)}</b><small>${p.pos}</small>${p.energy != null ? `<i class="nhl-energy"><i style="width:${Math.round(p.energy * 100)}%"></i></i>` : ''}</div>`;
    $('#side').innerHTML = ['away', 'home'].map(k => `<div class="panel"><div class="panel-h"><b style="color:${s[k].color === '#111111' ? '#e9f0f7' : 'inherit'}">${esc(s[k].abbr)} · no gelo</b></div>${onIce(k).map(row).join('')}</div>`).join('') + (deps.sidePanels ? deps.sidePanels(s) : '');
  }

  // ---------- frame loop ----------
  function frame(ts) {
    if (view.disposed || !canvas.isConnected) { dispose(); return; }
    const dt = view.last ? Math.min(0.1, (ts - view.last) / 1000) : 0; view.last = ts;
    let alpha = 1;
    if (view.engine && !view.paused && !view.simming) { alpha = view.engine.advance(dt); view.state = view.engine.state; }
    if (view.engine && (view.uiT = (view.uiT || 0) + dt) > 0.25) { view.uiT = 0; drawBug(); if ((view.sideT = (view.sideT || 0) + 1) % 4 === 0) drawSide(); }
    if (view.state) renderer.render(view.state, alpha, { camera: pref.camera, showNames: pref.names, showPhotos: pref.photos, debug: pref.debug, selected: view.selected, drawDebug: deps.drawDebug });
    drainEvents();
    pres.engine?.tick(dt);
    if (pend && view.engine?.state.over && !view.reported) reportToCareer();
    if (deps.onFrame) deps.onFrame(view, dt);
    view.raf = requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  $('#controls').addEventListener('click', e => { if (e.target.closest('button')) audio.play('ui', { category: 'UI', freq: 760 }); });
  $('#camSeg').onclick = e => { const k = e.target.dataset.cam; if (!k) return; pref.camera = k; store.set('asu_nhl_cam', k); root.querySelectorAll('#camSeg button').forEach(b => b.classList.toggle('on', b.dataset.cam === k)); };
  $('#optNames').onchange = e => { pref.names = e.target.checked; store.set('asu_nhl_names', pref.names ? '1' : '0'); };
  $('#optPhotos').onchange = e => { pref.photos = e.target.checked; store.set('asu_nhl_photos', pref.photos ? '1' : '0'); };
  $('#optDebug').onchange = e => { pref.debug = e.target.checked; };
  $('#homeSel').onchange = e => { pref.home = e.target.value; store.set('asu_nhl_home', pref.home); restart(); };
  $('#awaySel').onchange = e => { pref.away = e.target.value; store.set('asu_nhl_away', pref.away); restart(); };
  canvas.addEventListener('click', ev => {
    const r = canvas.getBoundingClientRect(); const p = renderer.pick(ev.clientX - r.left, ev.clientY - r.top);
    view.selected = p && view.selected !== p.id ? p.id : null;
    const el = $('#pcard');
    if (!view.selected) { el.classList.remove('show'); return; }
    el.innerHTML = `<img src="${esc(photoUrl(p.p))}" alt="" onerror="this.style.visibility='hidden'"><div><b>${esc(p.name)}</b><div class="muted small">#${esc(p.num)} · ${p.pos} · ${esc(view.state[p.team].abbr)}</div>${p.energy != null ? `<div class="muted small">Energia ${Math.round(p.energy * 100)}%</div>` : ''}</div>`;
    el.classList.add('show');
  });
  // ---------- presentation (commentary) — one per engine run; events drained from state.events ----------
  const pres = { comm: null, engine: null, unmount: null, idx: 0 };
  function startPresentation(seed) {
    pres.unmount?.(); pres.engine?.dispose(); pres.unControls?.();
    const s0 = view.state;
    stands.cur = s0 ? nhlStands({ home: s0.home.abbr, away: s0.away.abbr, homeColor: s0.home.color, awayColor: s0.away.color }) : null;
    pres.atmosphere = createAtmosphere({ rules: NHL_ATMOSPHERE, audio, crowd: stands });
    pres.comm = createCommentary({ pack: NHL_COMMENTARY, seed });
    pres.engine = createPresentation({ sport: 'nhl', listeners: [pres.comm, pres.atmosphere] });
    if (deps.commentaryCtx && s0) pres.atmosphere.refreshBaseline(deps.commentaryCtx(s0));
    pres.unmount = mountCommentaryPanel($('#liveComm'), pres.comm, { sport: 'nhl', voiceVolume: () => audio.volume('COMMENTARY') });
    pres.idx = 0;
    pres.comm.subscribe(l => { if (l.priority >= 3) flash(l.text, l.tone); });
    drawEngineControls();
  }
  // Big moments (goal, breakaway, big save…) flash over the ice for ~2.5 s.
  function flash(text, tone) {
    const el = $('#evtFlash'); if (!el) return;
    el.className = `evt-flash show tone-${tone}`; el.textContent = text;
    clearTimeout(view.flashT); view.flashT = setTimeout(() => { if (!view.disposed) el.classList.remove('show'); }, 2600);
  }
  // Speed / pause / simulation controls (only when an engine drives the match).
  function drawEngineControls() {
    pres.unControls?.(); pres.unControls = null;
    const e = view.engine, el = $('#ctrlExtra'); if (!el) return;
    if (!e?.setSpeed) { el.innerHTML = ''; return; }
    pres.unControls = mountEngineControls(el, { engine: e, view, storeKey: 'asu_nhl_speed', periodKey: s => s.period, labels: { period: 'Sim período' },
      onChunk: () => { drainEvents(); view.redraw(); }, onNewGame: () => { view.seedN = (view.seedN || 0) + 1; restart(); } });
  }
  function drainEvents() {
    const s = view.state, ev = s?.events; if (!ev || !pres.engine) return;
    if (pres.idx > ev.length) pres.idx = 0;
    if (pres.idx === ev.length) return;
    const ctx = deps.commentaryCtx ? deps.commentaryCtx(s) : {};
    while (pres.idx < ev.length) { const e = ev[pres.idx++]; pres.engine.emit(e, ctx); deps.onEvent?.(e, s, view); }
  }
  // career game finished → result (score + per-player lines keyed by raw roster id) back to the Career Hub
  function reportToCareer() {
    view.reported = true;
    const S = view.engine.state;
    writeResult({ careerId: pend.careerId, key: pend.key, h: pend.h, a: pend.a, hs: S.score.home, as: S.score.away, ot: S.period >= 4, lines: nhlLinesFromState(S) });
    const el = $('#ctrlExtra');
    if (el) { el.insertAdjacentHTML('afterbegin', '<button class="primary" id="backHub">Voltar ao Career Hub ↩</button>'); el.querySelector('#backHub').onclick = () => goTo('career'); }
    flash('Resultado enviado para a carreira ★', 'score');
  }
  view.presentation = pres;
  function restart() { view.engine?.dispose?.(); view.engine = null; view.state = null; setup().catch(err => { $('#bug').innerHTML = `<div class="nhl-notice bad">${esc(err.message)}</div>`; }); }

  function dispose() {
    if (view.disposed) return;
    view.disposed = true; cancelAnimationFrame(view.raf); renderer.dispose(); view.engine?.dispose?.(); pres.unmount?.(); pres.engine?.dispose(); pres.unControls?.();
    window.__nhlLoops = Math.max(0, (window.__nhlLoops || 1) - 1);
  }
  window.__nhlLoops = (window.__nhlLoops || 0) + 1;
  restart();
  view.raf = requestAnimationFrame(frame);
  view.redraw = () => { drawBug(); drawSide(); };
  window.__nhlMatch = view;
  return dispose;
}
