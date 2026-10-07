// MLB Partida 2D view: mount(root, deps) → dispose(). One rAF loop and no window listeners; all released on dispose.
// Phase B: real lineups (StatsAPI) or a labelled DEMO roster offline, defense set + batter at the plate.
// Phase F plugs the BaseballSimulationEngine through deps.createEngine.
import { D, teamBy, roster } from '../mlbData.js';
import { mlbColor } from '../teamColors.js';
import { buildLineup, demoRoster } from './lineup.js';
import { createFieldRenderer, CAMERAS } from '../field/fieldRenderer.js';
import { DEF_SPOTS, BATTER_SPOT } from '../field/geometry.js';
import { photoUrl } from '../photos.js';
import { getVisualMode, setVisualMode, VISUAL_MODES } from '../../../core/render/avatars.js';
import { openAvatarEditor, avatarThumb } from '../../../core/ui/avatarEditor.js';
import { mountFocus } from '../../../core/ui/focusMode.js';
import { separateKits } from '../../../core/render/sprites.js';
import { createPresentation } from '../../../core/presentation/presentationEngine.js';
import { createCommentary } from '../../../core/commentary/commentaryEngine.js';
import { mountCommentaryPanel } from '../../../core/commentary/commentaryPanel.js';
import { mountEngineControls } from '../../../core/ui/engineControls.js';
import { readPending, writeResult, goTo } from '../../../core/career/bridge.js';
import { mlbLinesFromState } from '../career/mlbSpec.js';
import { createAtmosphere } from '../../../core/presentation/atmosphere.js';
import { getAudio } from '../../../core/audio/audioEngine.js';
import { MLB_ATMOSPHERE, mlbStands } from '../presentation/atmosphere.js';
import { MLB_COMMENTARY } from '../presentation/commentary.js';

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
  const pref = { home: store.get('asu_mlb_home') || 'NYY', away: store.get('asu_mlb_away') || 'BOS', camera: store.get('asu_mlb_cam') || 'BROADCAST', names: store.get('asu_mlb_names') !== '0', visual: getVisualMode(), debug: false };
  const view = { raf: 0, disposed: false, state: null, engine: null, selected: null, last: 0 };
  const teamOpts = sel => D.teams.map(t => `<option value="${t.abbr}" ${t.abbr === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  root.innerHTML = `<div class="mlb-match">
    <div class="toolbar mlb-setup"><select id="awaySel">${teamOpts(pref.away)}</select><span class="muted">@</span><select id="homeSel">${teamOpts(pref.home)}</select><span class="grow"></span><span class="muted small" id="srcNote"></span></div>
    <div class="mlb-bug" id="bug"></div>
    <div class="mlb-match-grid">
      <div class="mlb-field-col"><div class="mlb-field-wrap2"><canvas id="fieldCanvas"></canvas><div class="mlb-pcard2" id="pcard"></div><div class="mlb-pitchinfo" id="pitchInfo"></div><div class="evt-flash" id="evtFlash"></div></div>
        <div class="controls mlb-controls" id="controls">
          <div class="seg" id="camSeg">${Object.entries(CAMERAS).map(([k, c]) => `<button data-cam="${k}" class="${k === pref.camera ? 'on' : ''}">${c.label}</button>`).join('')}</div>
          <span id="ctrlExtra" class="ctrl-extra"></span><span class="grow"></span>
          <label class="chk"><input type="checkbox" id="optNames" ${pref.names ? 'checked' : ''}> Nomes</label>
          <label class="chk">Visual <select id="optVisual">${VISUAL_MODES.map(([k, l]) => `<option value="${k}" ${k === pref.visual ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="chk"><input type="checkbox" id="optDebug"> Debug</label>
          <button id="focusBtn" class="primary" title="Só o campo 2D em tela cheia (F)">⛶ Modo 2D</button>
        </div></div>
      <aside class="mlb-side"><div id="liveComm"></div><div id="side"></div></aside>
    </div></div>`;
  const $ = s => root.querySelector(s);
  const canvas = $('#fieldCanvas');
  const audio = getAudio();
  // crowd stands: a stable proxy for the renderer, the real stands are rebuilt when the teams change
  const stands = { cur: null, draw: (c, a) => stands.cur?.draw(c, a), setIntensity: v => stands.cur?.setIntensity(v) };
  const renderer = createFieldRenderer(canvas, { ...deps, crowd: deps.crowd || stands });
  renderer.setCamera(pref.camera);

  function staticState(home, away) {
    const fielders = Object.entries(home.lineup.field).map(([k, f]) => ({ ...f, ...DEF_SPOTS[k] }));
    if (home.lineup.sp) fielders.push({ ...home.lineup.sp, ...DEF_SPOTS.P });
    const b = away.lineup.order[0];
    return { t: 0, home, away, fielders, batter: b && { ...b, ...BATTER_SPOT(b.bats) }, runners: [], ball: null, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0, score: { home: 0, away: 0 }, hits: { home: 0, away: 0 }, errors: { home: 0, away: 0 }, events: [] };
  }

  const pend = readPending('mlb'); // career game handed over by the Career Hub
  view.pending = pend;
  async function setup() {
    $('#bug').innerHTML = '<div class="muted" style="padding:10px">Carregando elencos…</div>';
    if (pend) { pref.home = pend.h; pref.away = pend.a; $('#homeSel').value = pend.h; $('#awaySel').value = pend.a; }
    const [h, a] = pend ? [pend.rosters.home, pend.rosters.away].map((rows, i) => { const ab = i ? pend.a : pend.h, t = teamBy(ab); return { abbr: ab, name: t.name, color: mlbColor(ab), color2: mlbColor(ab, 1), lineup: buildLineup(rows, ''), source: 'career' }; }) : await Promise.all([loadTeam(pref.home), loadTeam(pref.away)]);
    if (view.disposed) return;
    const [hk, ak] = separateKits([h.color, h.color2], [a.color, a.color2]);
    const home = withSide({ ...h, brand: h.color, color: hk[0], color2: hk[1] }, 'home'), away = withSide({ ...a, brand: a.color, color: ak[0], color2: ak[1] }, 'away');
    $('#srcNote').innerHTML = pend ? `★ Jogo da carreira “${esc(pend.careerName)}” — o resultado volta para o Career Hub` : [h, a].some(t => t.source === 'demo') ? '<span class="bad">Elenco DEMO (MLB StatsAPI indisponível) — sem nomes/fotos reais</span>' : 'Elencos: MLB StatsAPI (2026)';
    if (deps.createEngine) { view.engine = deps.createEngine({ home, away, seed: pend ? pend.seed : `${pref.away}@${pref.home}#${view.seedN || 0}` });
      if (pend) { $('#homeSel').disabled = true; $('#awaySel').disabled = true; } view.state = view.engine.state; }
    else view.state = staticState(home, away);
    startPresentation(`${pref.away}@${pref.home}`);
    drawBug(); drawSide();
  }

  function drawBug() {
    const s = view.state; if (!s) return;
    const bat = s.half === 'top' ? 'away' : 'home';
    const row = k => `<div class="mb-row ${bat === k ? 'batting' : ''}" style="--tc:${s[k].brand || s[k].color}"><b>${esc(s[k].abbr)}</b><span class="mb-r">${s.score[k]}</span><span class="mb-h">${s.hits[k]}</span><span class="mb-e">${s.errors[k]}</span></div>`;
    const occ = n => (s.runners || []).some(r => r.base === n) ? 'on' : '';
    $('#bug').innerHTML = `<div class="mb-teams"><div class="mb-head"><span></span><span>R</span><span>H</span><span>E</span></div>${row('away')}${row('home')}</div>
      <div class="mb-inning"><b>${s.half === 'top' ? '▲' : '▼'} ${s.inning}</b><small>${s.half === 'top' ? 'TOP' : 'BOTTOM'}</small></div>
      <div class="mb-diamond"><i class="b2 ${occ(2)}"></i><i class="b3 ${occ(3)}"></i><i class="b1 ${occ(1)}"></i></div>
      <div class="mb-count"><span>BALLS <b>${s.balls}</b></span><span>STRIKES <b>${s.strikes}</b></span><span>OUTS <b>${'●'.repeat(s.outs)}${'○'.repeat(Math.max(0, 3 - s.outs))}</b></span></div>`;
  }

  // last pitch: type, velocity and location in the zone (readability: what was thrown and where)
  const DEC_PT = { TAKE: 'Deixou passar', CONTACT: 'Contato', NORMAL_SWING: 'Swing normal', POWER_SWING: 'Swing de poder', PROTECT: 'Protege a zona', BUNT: 'Bunt' };
  const STAGE_PT = { PITCH: 'Arremesso', BATTER_READ: 'Leitura', DECISION: 'Decisão', CONTACT: 'Contato', BALL_FLIGHT: 'Bola no ar', FIELDING: 'Defesa', THROW: 'Arremesso', BASERUNNING: 'Corrida', RESULT: 'Resultado', PRE: '—' };
  function drawPitchInfo() {
    const el = $('#pitchInfo'), s = view.state, lp = s?.lastPitch; if (!el) return;
    if (!lp) { el.innerHTML = ''; return; }
    const px = 50 + lp.x / 1.6 * 50, pz = 100 - (lp.z - 0.5) / 4 * 100;
    const chips = (lp.pipeline || []).map(k => `<i class="${k === s.stage ? 'on' : ''}">${STAGE_PT[k] || k}</i>`).join('');
    el.innerHTML = `<div class="pi-zone"><i class="pi-box"></i><b class="${lp.inZone ? 'in' : 'out'}" style="left:${Math.max(4, Math.min(96, px))}%;top:${Math.max(4, Math.min(96, pz))}%"></b></div>
      <div><b title="${esc(lp.type)}">${esc(lp.name || lp.type)} · ${lp.mph} mph</b><span>${lp.rpm || '—'} rpm · eixo ${esc(lp.clock || '')}</span><span>quebra H ${lp.hb ?? '—'}\u2033 · V ${lp.vb ?? '—'}\u2033 · erro ${lp.miss ?? '—'}\u2033</span>
      <small>${s.balls}-${s.strikes} · ${esc(DEC_PT[lp.decision] || '')}${lp.read != null ? ` · leitura ${Math.round(lp.read * 100)}%` : ''}</small><div class="pi-stages">${chips}</div></div>`;
  }
  function fillThumbs(scope) {
    scope.querySelectorAll('.th').forEach(th => {
      if (pref.visual === 'photo') { th.innerHTML = `<img src="${esc(th.dataset.photo)}" alt="" onerror="this.style.visibility='hidden'">`; return; }
      const tm = view.state?.[th.dataset.team] || {};
      th.replaceChildren(avatarThumb({ sport: 'mlb', id: th.dataset.pid, color: tm.color, color2: tm.color2, number: th.dataset.num, kit: 'baseball', prop: th.dataset.role === 'BATTER' ? 'bat' : 'glove' }));
    });
  }
  function drawSide() {
    const s = view.state; if (!s) return;
    const fieldTeam = s.half === 'top' ? 'home' : 'away';
    const pitcher = (s.fielders || []).find(f => f.pos === 'P'), batter = s.batter;
    const card = (e, role) => e ? `<div class="mlb-matchcard"><span class="th" data-pid="${esc(e.pid ?? e.id)}" data-team="${esc(e.team)}" data-role="${role}" data-num="${esc(e.num)}" data-photo="${esc(photoUrl(e.p))}"></span><div><small class="muted">${role}</small><b>${esc(e.name)}</b><div class="muted small">#${esc(e.num)} · ${esc(e.pos)} · ${role === 'PITCHER' ? 'Throws ' + e.throws : 'Bats ' + e.bats}</div>${deps.cardExtra ? deps.cardExtra(e, role, s) : ''}</div></div>` : '';
    const order = s[s.half === 'top' ? 'away' : 'home'].lineup.order;
    $('#side').innerHTML = `<div class="panel">${card(pitcher, 'PITCHER')}${card(batter, 'BATTER')}</div>
      <div class="panel"><div class="panel-h"><b>Lineup ${esc(s[s.half === 'top' ? 'away' : 'home'].abbr)}</b></div>${order.map((o, i) => `<div class="mlb-lu ${batter && o.pid === batter.pid ? 'now' : ''}"><span>${i + 1}</span><b>${esc(o.last)}</b><small>${esc(o.pos)}</small></div>`).join('')}</div>
      <div class="panel"><div class="panel-h"><b>Defesa ${esc(s[fieldTeam].abbr)}</b></div>${(s.fielders || []).map(f => `<div class="mlb-lu"><span>${esc(f.pos)}</span><b>${esc(f.last)}</b><small>#${esc(f.num)}</small></div>`).join('')}</div>` + (deps.sidePanels ? deps.sidePanels(s) : '');
    fillThumbs($('#side'));
  }

  function frame(ts) {
    if (view.disposed || !canvas.isConnected) { dispose(); return; }
    const dt = view.last ? Math.min(0.1, (ts - view.last) / 1000) : 0; view.last = ts;
    let alpha = 1;
    if (view.engine && !view.paused && !view.simming) { alpha = view.engine.advance(dt); view.state = view.engine.state; }
    if (view.engine && (view.uiT = (view.uiT || 0) + dt) > 0.25) { view.uiT = 0; drawBug(); drawPitchInfo(); if ((view.sideT = (view.sideT || 0) + 1) % 4 === 0) drawSide(); }
    if (view.state) renderer.render(view.state, alpha, { camera: pref.camera, cameraTarget: view.engine?.cameraTarget?.(pref.camera), showNames: pref.names, visual: pref.visual, debug: pref.debug, selected: view.selected, drawDebug: deps.drawDebug });
    drainEvents();
    pres.engine?.tick(dt);
    if (pend && view.engine?.state.over && !view.reported) reportToCareer();
    if (deps.onFrame) deps.onFrame(view, dt);
    view.raf = requestAnimationFrame(frame);
  }

  $('#controls').addEventListener('click', e => { if (e.target.closest('button')) audio.play('ui', { category: 'UI', freq: 760 }); });
  $('#camSeg').onclick = e => { const k = e.target.dataset.cam; if (!k) return; pref.camera = k; store.set('asu_mlb_cam', k); root.querySelectorAll('#camSeg button').forEach(b => b.classList.toggle('on', b.dataset.cam === k)); };
  $('#optNames').onchange = e => { pref.names = e.target.checked; store.set('asu_mlb_names', pref.names ? '1' : '0'); };
  $('#optVisual').onchange = e => { pref.visual = e.target.value; setVisualMode(pref.visual); fillThumbs($('#side')); };
  const unfocus = mountFocus(root.querySelector('.mlb-match'), { button: $('#focusBtn') });
  $('#optDebug').onchange = e => { pref.debug = e.target.checked; };
  $('#homeSel').onchange = e => { pref.home = e.target.value; store.set('asu_mlb_home', pref.home); restart(); };
  $('#awaySel').onchange = e => { pref.away = e.target.value; store.set('asu_mlb_away', pref.away); restart(); };
  // today's form for the selected player (adaptive attributes computed from the live game state)
  function adaptLine(e) {
    try {
      const rec = view.state?.roster?.[e.id], a = rec && view.engine?.adaptive?.(rec); if (!a) return '';
      const pick = ['Form', 'Fatigue', 'Confidence', 'Pressure Response'].map(n => a.list.find(x => x.name === n));
      return `<div class="small" style="margin:4px 0">${pick.map(x => `<span title="${esc(x.tip)}" style="margin-right:8px">${esc(x.name.replace('Fatigue', 'Frescor').replace('Confidence', 'Confiança').replace('Pressure Response', 'Pressão').replace('Form', 'Forma'))} <b>${x.value}</b></span>`).join('')}</div>`;
    } catch { return ''; }
  }
  canvas.addEventListener('click', ev => {
    const r = canvas.getBoundingClientRect(); const e = renderer.pick(ev.clientX - r.left, ev.clientY - r.top);
    view.selected = e && view.selected !== e.id ? e.id : null;
    const el = $('#pcard');
    if (!view.selected) { el.classList.remove('show'); return; }
    const tm = view.state?.[e.team] || {}, rl = e.role || (e === view.state?.batter ? 'batter' : 'fielder');
    el.innerHTML = `<span id="pcThumb"></span><div><b>${esc(e.name)}</b><div class="muted small">#${esc(e.num)} · ${esc(e.pos)} · B/T ${e.bats}/${e.throws}</div>${adaptLine(e)}<button id="pcEdit" class="small">✎ Editar boneco</button></div>`;
    const pid = e.pid ?? e.id, ctxA = { sport: 'mlb', id: pid, color: tm.color, color2: tm.color2, number: e.num, kit: 'baseball', prop: rl === 'batter' ? 'bat' : 'glove' };
    if (pref.visual === 'photo') el.querySelector('#pcThumb').innerHTML = `<img src="${esc(photoUrl(e.p))}" alt="" onerror="this.style.visibility='hidden'">`; else el.querySelector('#pcThumb').appendChild(avatarThumb(ctxA));
    el.querySelector('#pcEdit').onclick = () => openAvatarEditor({ ...ctxA, name: e.name, pos: e.pos, role: rl, onSave: () => { el.querySelector('#pcThumb').replaceChildren(avatarThumb(ctxA)); } });
    el.classList.add('show');
  });
  // ---------- presentation (commentary) — one per engine run; events drained from state.events ----------
  const pres = { comm: null, engine: null, unmount: null, idx: 0 };
  function startPresentation(seed) {
    pres.unmount?.(); pres.engine?.dispose(); pres.unControls?.();
    const s0 = view.state;
    stands.cur = s0 ? mlbStands({ home: s0.home.abbr, away: s0.away.abbr, homeColor: s0.home.color, awayColor: s0.away.color }) : null;
    pres.atmosphere = createAtmosphere({ rules: MLB_ATMOSPHERE, audio, crowd: stands });
    pres.comm = createCommentary({ pack: MLB_COMMENTARY, seed });
    pres.engine = createPresentation({ sport: 'mlb', listeners: [pres.comm, pres.atmosphere] });
    if (deps.commentaryCtx && s0) pres.atmosphere.refreshBaseline(deps.commentaryCtx(s0));
    pres.unmount = mountCommentaryPanel($('#liveComm'), pres.comm, { sport: 'mlb', voiceVolume: () => audio.volume('COMMENTARY') });
    pres.idx = 0;
    pres.comm.subscribe(l => { if (l.priority >= 3) flash(l.text, l.tone); });
    drawEngineControls();
  }
  function flash(text, tone) {
    const el = $('#evtFlash'); if (!el) return;
    el.className = `evt-flash show tone-${tone}`; el.textContent = text;
    clearTimeout(view.flashT); view.flashT = setTimeout(() => { if (!view.disposed) el.classList.remove('show'); }, 2600);
  }
  function drawEngineControls() {
    pres.unControls?.(); pres.unControls = null;
    const e = view.engine, el = $('#ctrlExtra'); if (!el) return;
    if (!e?.setSpeed) { el.innerHTML = ''; return; }
    pres.unControls = mountEngineControls(el, { engine: e, view, storeKey: 'asu_mlb_speed', periodKey: s => `${s.inning}${s.half}`, labels: { period: 'Sim meia-entrada' },
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
    writeResult({ careerId: pend.careerId, key: pend.key, h: pend.h, a: pend.a, hs: S.score.home, as: S.score.away, ot: S.inning > 9, lines: mlbLinesFromState(S) });
    const el = $('#ctrlExtra');
    if (el) { el.insertAdjacentHTML('afterbegin', '<button class="primary" id="backHub">Voltar ao Career Hub ↩</button>'); el.querySelector('#backHub').onclick = () => goTo('career'); }
    flash('Resultado enviado para a carreira ★', 'score');
  }
  view.presentation = pres;
  function restart() { view.engine?.dispose?.(); view.engine = null; view.state = null; setup().catch(err => { $('#bug').innerHTML = `<div class="mlb-notice bad">${esc(err.message)}</div>`; }); }
  function dispose() {
    if (view.disposed) return;
    view.disposed = true; unfocus?.(); cancelAnimationFrame(view.raf); renderer.dispose(); view.engine?.dispose?.(); pres.unmount?.(); pres.engine?.dispose(); pres.unControls?.();
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
