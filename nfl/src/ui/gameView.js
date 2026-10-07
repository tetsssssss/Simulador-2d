// Partida 2D — presentation and control around the real engine. One fixed-step simulation clock (SIM_HZ)
// decoupled from rendering: playback speed only changes how many fixed steps run per real second, never the math.
// Modes (QUICK / COACH / SPECTATOR / SANDBOX / CAREER) differ only in who calls the plays; all run NFLPlay.
import { step } from '../sim/playSim.js';
import { applyPlayEvents } from '../sim/stats.js';
import { createRenderer } from './fieldRenderer.js';
import {
  newGameState, offAbbr, defAbbr, clockStr, ballSpot, downText, makeLineupCache, cpuOffenseCall, cpuDefenseCall,
  snap, applyPlay, summarize, logText, runFamilies, passConcepts, defCalls, conceptLabel, simulateRest, PLAY_TYPES,
} from '../game/match.js';
import { createPresentation } from '../../../core/presentation/presentationEngine.js';
import { createCommentary } from '../../../core/commentary/commentaryEngine.js';
import { mountCommentaryPanel } from '../../../core/commentary/commentaryPanel.js';
import { NFL_COMMENTARY } from '../presentation/commentary.js';
import { esc, avatar, teamLogo, ovrBadge, ratingsOf, keyAttrs, keyForAttribute, pid } from './components.js';

export { newGameState };

export const MODES = {
  QUICK: { label: 'Quick Game', icon: '⚡', desc: 'Escolha mandante e visitante e jogue. Você chama o ataque dos dois lados; a CPU escolhe as coberturas.' },
  COACH: { label: 'Coach Mode', icon: '📋', desc: 'Você comanda um time: chama jogadas no ataque e coberturas na defesa. A CPU controla o adversário.' },
  SPECTATOR: { label: 'Spectator', icon: '📺', desc: 'CPU x CPU com Auto Play. Assista, acelere ou simule até o fim.' },
  SANDBOX: { label: 'Sandbox', icon: '🧪', desc: 'Laboratório: monte a situação (descida, distância, campo), escolha ataque e cobertura, repita a mesma seed.' },
  CAREER: { label: 'Career', icon: '🏆', desc: 'Jogo da semana da carreira ativa. O placar entra na tabela e nas estatísticas da temporada.' },
};
const SPEEDS = [0.5, 1, 2, 4];
let activeCleanup = null; // guarantees a single rAF loop / key handler across re-mounts

export function mountGame(root, deps) {
  if (activeCleanup) activeCleanup();
  const { state, teamBy, toast } = deps;
  const S = () => deps.settings();
  const m = state.match;
  if (!m || !m.g || m.suspended) return renderSetup(root, deps);
  const g = m.g;
  const disp = S().display;
  const view = {
    sim: null, raf: 0, acc: 0, last: 0, speed: disp.animSpeed || 1, paused: false, debug: !!disp.debug, zoom: 'medium',
    follow: disp.cameraFollow !== false, phase: 'AWAIT', deadAt: null, resultAt: null, auto: m.mode === 'SPECTATOR' || !!m.auto,
    selected: null, playClock: 40, pendingCall: null, lastSum: null, boxTab: 'TEAM', simming: false, sel: { off: null, def: null },
  };
  const cache = makeLineupCache(() => m.roster ? m.roster(state.roster) : state.roster);
  const sandbox = m.mode === 'SANDBOX';
  const sb = m.sandbox ||= { down: 1, distance: 10, ballOn: 30, lockSeed: false, n: 0 };
  const userTeam = () => m.userTeam; // team the user coaches (COACH/CAREER); QUICK = offense of both; SPECTATOR = none
  const userCallsOffense = () => sandbox || m.mode === 'QUICK' || ((m.mode === 'COACH' || m.mode === 'CAREER') && offAbbr(g) === userTeam());
  const userCallsDefense = () => sandbox || ((m.mode === 'COACH' || m.mode === 'CAREER') && defAbbr(g) === userTeam());

  root.innerHTML = `<div class="match ${disp.hudDensity === 'compact' ? 'hud-compact' : ''}">
    <div class="scorebug" id="bug"></div>
    <div class="match-grid">
      <div class="field-col">
        <div class="field-wrap"><canvas id="fieldCanvas"></canvas>
          <div class="result-pop" id="resultPop"></div><div class="pcard" id="pcard"></div><div class="debug-hud" id="dbg"></div>
          <div class="call-tag" id="callTag"></div></div>
        <div class="controls" id="controls">
          <button id="pauseBtn" class="icon-btn" title="Pause/Play (Espaço)">⏸</button>
          <div class="seg" id="speedSeg">${SPEEDS.map(v => `<button data-speed="${v}" class="${v === view.speed ? 'on' : ''}">${v}x</button>`).join('')}</div>
          <button id="nextBtn" title="Próxima jogada com chamada da CPU (N)">Next Play ▶</button>
          <button id="autoBtn" class="toggle ${view.auto ? 'on' : ''}" title="CPU chama todas as jogadas automaticamente">Auto Play</button>
          ${sandbox ? '' : '<button id="simEndBtn" title="Simula o resto do jogo com o motor (sem animação)">Sim to end ⏭</button>'}
          <span class="grow"></span>
          <div class="seg" id="zoomSeg"><button data-zoom="close">Close</button><button data-zoom="medium" class="on">Mid</button><button data-zoom="full">Full</button></div>
          <button id="camBtn" class="toggle ${view.follow ? 'on' : ''}" title="Câmera segue a bola">Cam</button>
          <div class="seg" id="viewSeg"><button data-view="normal" class="${view.debug ? '' : 'on'}">Normal</button><button data-view="debug" class="${view.debug ? 'on' : ''}">Debug</button></div>
          <button id="exitBtn" class="ghost" title="Sair para a seleção de modo">✕</button>
        </div>
        <div class="drive-strip" id="strip"></div>
      </div>
      <aside class="side-col">
        <div class="panel call-panel" id="callPanel"></div>
        <div id="liveComm"></div>
        <div class="panel log-panel"><div class="panel-h"><b>Game Log</b><small class="muted" id="logCount"></small></div><div class="log" id="log"></div></div>
      </aside>
    </div>
    <div class="panel box-panel"><div class="tabs" id="boxTabs">${['TEAM', 'PASSING', 'RUSHING', 'RECEIVING', 'DEFENSE', 'SCORING'].map(t => `<button data-tab="${t}" class="${t === view.boxTab ? 'on' : ''}">${t}</button>`).join('')}</div><div id="boxScore"></div></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const canvas = $('#fieldCanvas');
  const renderer = createRenderer(canvas);
  // Canvas resizes are tracked by the renderer (ResizeObserver + DPR watch); no window listener needed.
  const renderOpts = () => ({ debug: view.debug, zoom: view.zoom, follow: view.follow, photos: S().display.photos, selected: view.selected?.id, teams: { off: offAbbr(g), def: defAbbr(g), home: g.home, away: g.away } });
  const tuning = () => deps.tuning();
  const lineups = () => cache.get(offAbbr(g), defAbbr(g));

  // ---------- presentation: live commentary (CommentaryEvent → text → optional voice) ----------
  const commentary = createCommentary({ pack: NFL_COMMENTARY, seed: `${g.away}@${g.home}` });
  const presentation = createPresentation({ sport: 'nfl', listeners: [commentary] });
  const unmountComm = mountCommentaryPanel($('#liveComm'), commentary, { sport: 'nfl', voiceVolume: () => deps.audio?.volume?.('COMMENTARY') ?? 1 });
  const lastOf = full => { const parts = String(full || '').replace(/\s+(Jr\.?|Sr\.?|II|III|IV|V)$/i, '').split(' '); return parts[parts.length - 1] || full; };
  function commCtx(s) {
    const ls = lineups(), off = offAbbr(g), def = defAbbr(g);
    const sc = t => (t === g.home ? g.homeScore : g.awayScore);
    return {
      name: id => ls.who[id]?.name, last: id => lastOf(ls.who[id]?.name), off, def, home: g.home, away: g.away,
      homeScore: g.homeScore, awayScore: g.awayScore, score: { off: sc(off), def: sc(def) },
      quarter: g.quarter, clock: g.clock, down: g.down, distance: g.distance, spot: ballSpot(g), redZone: g.ballOn >= 80,
      losX: s?.losX ?? (g.ballOn + 10), qbId: s?.qb?.id, clockLabel: g.over ? 'FINAL' : `Q${g.quarter} ${clockStr(g.clock)}`,
    };
  }
  view.commIdx = 0;
  function emitLive(s) {
    if (!s?.events || view.commIdx >= s.events.length) return;
    const ctx = commCtx(s);
    while (view.commIdx < s.events.length) presentation.emit(s.events[view.commIdx++], ctx);
  }
  function emitAfterPlay(before, notes = []) {
    const ctx = { ...commCtx(null), off: before.off, def: before.def, prevDown: before.down };
    if (notes.includes('1ª descida!')) presentation.emit({ type: 'FIRST_DOWN' }, ctx);
    if (notes.some(n => n.startsWith('Turnover on downs'))) presentation.emit({ type: 'TURNOVER_ON_DOWNS' }, ctx);
    if (g.over) presentation.emit({ type: 'FINAL' }, commCtx(null));
    else if (g.quarter !== before.quarter) presentation.emit({ type: 'QUARTER_START', quarter: g.quarter }, commCtx(null));
  }

  // ---------- scorebug (broadcast HUD) ----------
  function drawBug() {
    const A = teamBy(g.away), H = teamBy(g.home), pos = offAbbr(g);
    const side = (T, score, right) => `<div class="bug-team ${right ? 'right' : ''} ${pos === T.abbr && !g.over ? 'has-ball' : ''}" style="--tc:${T.color || '#24364d'}">
      ${teamLogo(T, 'md')}<div class="bug-name"><b>${esc(T.abbr)}</b><small>${esc(T.name.split(' ').slice(-1)[0])}</small></div><span class="bug-score">${score}</span><i class="poss" title="posse">●</i></div>`;
    const q = g.over ? 'FINAL' : `${['1st', '2nd', '3rd', '4th'][Math.min(4, g.quarter) - 1]}`;
    const awaiting = view.phase === 'AWAIT' && !g.over;
    $('#bug').innerHTML = `${side(A, g.awayScore, false)}
      <div class="bug-mid"><div class="bug-clock"><span>${q}</span><b>${g.over ? '' : clockStr(g.clock)}</b>${awaiting ? `<em class="pclock ${view.playClock <= 10 ? 'low' : ''}" title="play clock">:${String(Math.max(0, Math.ceil(view.playClock))).padStart(2, '0')}</em>` : ''}</div>
      <div class="bug-down">${g.over ? `${esc(MODES[m.mode]?.label || '')}` : `<b>${downText(g)}</b><span>${esc(ballSpot(g))}</span>`}</div></div>
      ${side(H, g.homeScore, true)}`;
  }

  // ---------- play call panel ----------
  function drawCallPanel() {
    const p = $('#callPanel');
    if (g.over) { p.innerHTML = finalPanel(); bindFinal(); return; }
    if (view.simming) { p.innerHTML = `<div class="panel-h"><b>Simulando…</b></div><p class="muted">Motor rodando todas as jogadas até o apito final.</p>`; return; }
    if (view.phase !== 'AWAIT') {
      const c = view.sim?.call;
      p.innerHTML = `<div class="panel-h"><b>Em jogo</b><small class="muted">${esc(offAbbr(g))} ataca</small></div>${c ? `<div class="live-call"><span class="chip">${esc(PLAY_TYPES[c.playType])}</span><b>${esc(conceptLabel(c.concept))}</b><span class="muted">vs ${esc(c.defLabel)}</span></div>` : ''}${view.lastSum ? resultCard(view.lastSum, true) : ''}`;
      return;
    }
    const off = userCallsOffense(), def = userCallsDefense();
    const head = `<div class="panel-h"><b>${off && def ? 'Sandbox Call' : off ? `Ataque · ${esc(offAbbr(g))}` : def ? `Defesa · ${esc(defAbbr(g))}` : 'CPU x CPU'}</b><small class="muted">${esc(downText(g))} · ${esc(ballSpot(g))}</small></div>`;
    let body = '';
    if (sandbox) body += sandboxForm();
    if (off) {
      const sel = view.sel.off;
      body += `<div class="call-sec"><h5>RUN</h5><div class="run-grid">${runFamilies().map(f => `<div class="run-fam"><span>${esc(f.label)}</span><button data-call="run:${f.L}" class="${sel === 'run:' + f.L ? 'on' : ''}">◀ L</button><button data-call="run:${f.R}" class="${sel === 'run:' + f.R ? 'on' : ''}">R ▶</button></div>`).join('')}</div></div>
        ${['pass', 'deep'].map(t => `<div class="call-sec"><h5>${PLAY_TYPES[t]}</h5><div class="pass-grid">${passConcepts(t).map(c => `<button data-call="${t}:${c.key}" title="${esc(c.routes)}" class="${sel === t + ':' + c.key ? 'on' : ''}"><b>${esc(c.label)}</b><small>${esc(c.routes.replace(/ · RB:CHECK/, ''))}</small></button>`).join('')}</div></div>`).join('')}`;
    }
    if (def) body += `<div class="call-sec"><h5>DEFENSE</h5><div class="def-grid">${defCalls().map(d => `<button data-dcall="${d.key}" class="${view.sel.def === d.key ? 'on' : ''}">${esc(d.label)}</button>`).join('')}</div></div>`;
    if (!off && !def) body += `<p class="muted">A CPU chama as jogadas dos dois times. Use <b>Next Play</b> ou ligue <b>Auto Play</b>.</p>`;
    const needBoth = sandbox;
    body += `<div class="call-actions">${needBoth ? `<button class="primary" id="snapBtn" ${view.sel.off ? '' : 'disabled'}>SNAP ▶</button><button id="replayBtn" title="Repete a última jogada com a mesma seed">↺ Replay seed</button>` : ''}<button id="cpuCallBtn" title="Deixar a CPU chamar esta jogada">CPU call</button></div>`;
    p.innerHTML = head + body;
    p.querySelectorAll('[data-call]').forEach(b => b.onclick = () => {
      view.sel.off = b.dataset.call;
      if (!needBoth && !def) return userSnap();
      drawCallPanel();
    });
    p.querySelectorAll('[data-dcall]').forEach(b => b.onclick = () => {
      view.sel.def = b.dataset.dcall;
      if (!needBoth && !off) return userSnap();
      drawCallPanel();
    });
    $('#snapBtn') && ($('#snapBtn').onclick = userSnap);
    $('#replayBtn') && ($('#replayBtn').onclick = () => { if (sb.last) runCall(sb.last.call, sb.last.seedN); });
    $('#cpuCallBtn').onclick = () => runCall(cpuCall());
    if (sandbox) bindSandboxForm();
  }

  function sandboxForm() {
    const tOpts = sel => state.teams.map(t => `<option value="${t.abbr}" ${sel === t.abbr ? 'selected' : ''}>${esc(t.abbr)}</option>`).join('');
    return `<div class="sb-form"><label>Ataque<select id="sbOff">${tOpts(g.home)}</select></label><label>Defesa<select id="sbDef">${tOpts(g.away)}</select></label>
      <label>Down<select id="sbDown">${[1, 2, 3, 4].map(d => `<option ${sb.down === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Dist<input id="sbDist" type="number" min="1" max="99" value="${sb.distance}"></label>
      <label>Ball on (own)<input id="sbBall" type="number" min="1" max="99" value="${sb.ballOn}"></label>
      <label class="chk"><input type="checkbox" id="sbLock" ${sb.lockSeed ? 'checked' : ''}> Lock seed</label></div>`;
  }
  function bindSandboxForm() {
    const upd = () => {
      sb.down = +$('#sbDown').value; sb.distance = Math.max(1, Math.min(99, +$('#sbDist').value || 10)); sb.ballOn = Math.max(1, Math.min(99, +$('#sbBall').value || 30)); sb.lockSeed = $('#sbLock').checked;
      const o = $('#sbOff').value, d = $('#sbDef').value;
      if (o !== g.home || d !== g.away) { g.home = o; g.away = d; cache.clear(); }
      applySandboxSituation(); preview(); drawBug();
    };
    ['#sbOff', '#sbDef', '#sbDown', '#sbDist', '#sbBall', '#sbLock'].forEach(id => $(id).onchange = upd);
  }
  function applySandboxSituation() { g.possession = 'home'; g.down = sb.down; g.distance = sb.distance; g.ballOn = sb.ballOn; }

  function parseOff(sel) { const [playType, concept] = sel.split(':'); return { playType, concept }; }
  function cpuCall() {
    const o = userCallsOffense() && view.sel.off ? parseOff(view.sel.off) : cpuOffenseCall(g);
    return { ...o, defCall: userCallsDefense() && view.sel.def ? view.sel.def : cpuDefenseCall(g) };
  }
  function userSnap() {
    const o = userCallsOffense() ? (view.sel.off ? parseOff(view.sel.off) : null) : cpuOffenseCall(g);
    if (!o) { toast('Escolha uma jogada de ataque'); return; }
    // Sandbox without a coverage pick → CPU coverage; Coach on defense always picks (clicking a coverage snaps).
    const defCall = (userCallsDefense() && view.sel.def) || cpuDefenseCall(g);
    runCall({ ...o, defCall });
  }

  // ---------- snap / run ----------
  function preview() {
    const ls = lineups();
    if (ls.offense.length < 11 || ls.defense.length < 11) { view.sim = null; return; }
    try { view.sim = snap(g, ls, { playType: 'pass', concept: 'DRIVE', defCall: 'COVER_3' }, tuning()); } catch { view.sim = null; }
  }
  function runCall(call, seedN) {
    if (g.over || view.simming || view.phase === 'RUN') return;
    if (sandbox) applySandboxSituation();
    const ls = lineups();
    if (ls.offense.length < 11 || ls.defense.length < 11) { toast('Roster indisponível: sincronize em Dados & Fotos.'); return; }
    let s;
    try {
      if (sandbox) {
        const n = seedN ?? (sb.lockSeed && sb.last ? sb.last.seedN : ++sb.n);
        const saveNo = g.playNo; g.playNo = n - 1;
        s = snap(g, ls, call, tuning()); g.playNo = saveNo;
        sb.last = { call, seedN: n };
      } else s = snap(g, ls, call, tuning());
    } catch (e) { toast(e.message); return; }
    view.sim = s; view.commIdx = 0; view.acc = 0; view.phase = 'RUN'; view.deadAt = null; view.paused = false; view.sel = { off: null, def: null };
    $('#resultPop').classList.remove('show');
    $('#callTag').innerHTML = `<span class="chip">${esc(PLAY_TYPES[s.call.playType])}</span> ${esc(conceptLabel(s.call.concept))} <span class="muted">vs ${esc(s.call.defLabel)}</span>`;
    syncControls(); drawCallPanel(); drawBug();
  }

  function finishPlay() {
    const s = view.sim, ls = lineups();
    emitLive(s);
    const before = { off: offAbbr(g), def: defAbbr(g), down: g.down, quarter: g.quarter };
    let sum;
    if (sandbox) {
      applyPlayEvents(g.box, s.result.events, ls.who, offAbbr(g));
      sum = summarize(s, ls.who);
      g.log.unshift({ q: '', clock: `seed #${sb.last.seedN}`, off: offAbbr(g), situation: `${downText(g)} · ${ballSpot(g)}`, text: `${logText(sum)} (vs ${s.call.defLabel})`, tone: sum.tone, kind: 'play' });
    } else { const res = applyPlay(g, s, ls.who); sum = res.sum; emitAfterPlay(before, res.notes); }
    view.lastSum = sum;
    $('#resultPop').innerHTML = resultCard(sum) + (sandbox ? '' : `<div class="rp-next">${g.over ? 'FINAL' : `${esc(downText(g))} · ${esc(ballSpot(g))}`}</div>`);
    $('#resultPop').classList.add('show');
    view.phase = 'AWAIT'; view.resultAt = performance.now(); view.playClock = 40;
    $('#callTag').innerHTML = '';
    if (!sandbox) persist();
    if (g.over) onOver();
    drawAll();
  }

  function persist() { deps.onProgress?.(m); }
  function onOver() { view.auto = false; deps.onGameOver?.(m); }

  // ---------- result card / final ----------
  function resultCard(sum, small = false) {
    return `<div class="rcard tone-${sum.tone} ${small ? 'small' : ''}"><div class="rc-title">${esc(sum.title)}</div><div class="rc-main">${sum.lines.map((l, i) => `<div class="${i ? 'muted' : 'rc-who'}">${esc(l)}</div>`).join('')}</div><div class="rc-badge">${esc(sum.badge)}</div>${sum.tackle ? `<div class="rc-tk">Tackle: ${esc(sum.tackle)}</div>` : ''}<div class="rc-def muted">${esc(sum.concept)} vs ${esc(sum.defense)}</div></div>`;
  }
  function finalPanel() {
    const A = teamBy(g.away), H = teamBy(g.home);
    const win = g.homeScore > g.awayScore ? H : g.awayScore > g.homeScore ? A : null;
    return `<div class="panel-h"><b>FINAL</b><small class="muted">${esc(MODES[m.mode]?.label || '')}</small></div>
      <div class="final-score">${teamLogo(A, 'md')}<b>${g.awayScore}</b><span>–</span><b>${g.homeScore}</b>${teamLogo(H, 'md')}</div>
      <p class="center">${win ? `<b>${esc(win.name)}</b> vencem` : 'Empate'} · ${g.playNo} jogadas</p>
      <div class="call-actions">${m.mode === 'CAREER' ? '<button class="primary" id="toCareer">Voltar à carreira</button>' : '<button class="primary" id="again">Nova partida</button>'}</div>`;
  }
  function bindFinal() {
    $('#toCareer') && ($('#toCareer').onclick = () => deps.navigate('home'));
    $('#again') && ($('#again').onclick = () => { state.match = null; mountGame(root, deps); });
  }

  // ---------- log, strip, box ----------
  function drawLog() {
    $('#logCount').textContent = `${g.log.filter(l => l.kind === 'play').length} jogadas`;
    $('#log').innerHTML = g.log.length ? g.log.slice(0, 200).map(l => typeof l === 'string' ? `<div class="logline">${esc(l)}</div>` :
      `<div class="logline k-${l.kind} tone-${l.tone || ''}"><span class="lt">${l.q ? `Q${l.q} ` : ''}${esc(l.clock)}</span><span class="lx">${['period', 'final'].includes(l.kind) ? '' : `<b>${esc(l.off)}</b> `}${esc(l.text)}${l.situation ? `<small>${esc(l.situation)}</small>` : ''}</span></div>`).join('') : '<p class="muted">Nenhuma jogada ainda.</p>';
    const last = g.log.filter(l => l.kind === 'play').slice(0, 8).reverse();
    $('#strip').innerHTML = last.map(l => `<span class="strip-chip tone-${l.tone}" title="${esc(l.situation || '')}">${esc(l.off)} · ${esc(l.text.split(' · ')[0])}</span>`).join('');
  }

  function drawBox() {
    const players = Object.values(g.box.players);
    const tm = a => g.box.teams[a] || { plays: 0, yards: 0, passYds: 0, rushYds: 0, firstDowns: 0, turnovers: 0, sacksAllowed: 0 };
    const n = p => `<td class="pn">${esc(p.name)} <small class="muted">${esc(p.team)} · ${esc(p.pos)}</small></td>`;
    const tbl = (head, rows) => rows.length ? `<table class="table compact"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="muted">Sem dados ainda.</p>';
    const avg = (y, a) => (a ? (y / a).toFixed(1) : '—');
    let html = '';
    switch (view.boxTab) {
      case 'TEAM': {
        const A = tm(g.away), H = tm(g.home);
        const row = (l, a, h) => `<tr><td>${l}</td><td>${a}</td><td>${h}</td></tr>`;
        html = `<table class="table compact team-cmp"><thead><tr><th></th><th>${esc(g.away)}</th><th>${esc(g.home)}</th></tr></thead><tbody>
          ${row('Pontos', g.awayScore, g.homeScore)}${row('Jogadas', A.plays, H.plays)}${row('Jardas totais', A.yards, H.yards)}${row('Jardas/jogada', avg(A.yards, A.plays), avg(H.yards, H.plays))}
          ${row('Passe', A.passYds, H.passYds)}${row('Corrida', A.rushYds, H.rushYds)}${row('1ªs descidas', A.firstDowns, H.firstDowns)}${row('Turnovers', A.turnovers, H.turnovers)}${row('Sacks sofridos', A.sacksAllowed, H.sacksAllowed)}</tbody></table>`;
        break;
      }
      case 'PASSING': html = tbl(['Jogador', 'C/A', '%', 'Jds', 'Y/A', 'TD', 'INT', 'Sk'], players.filter(p => p.pass.att || p.pass.sacks).map(p => `<tr>${n(p)}<td>${p.pass.cmp}/${p.pass.att}</td><td>${p.pass.att ? Math.round(100 * p.pass.cmp / p.pass.att) : '—'}</td><td>${p.pass.yds}</td><td>${avg(p.pass.yds, p.pass.att)}</td><td>${p.pass.td}</td><td>${p.pass.int}</td><td>${p.pass.sacks}-${p.pass.sackYds}</td></tr>`)); break;
      case 'RUSHING': html = tbl(['Jogador', 'Att', 'Jds', 'Avg', 'TD', 'Long', 'YBC', 'YAC', 'MTF'], players.filter(p => p.rush.att).sort((a, b) => b.rush.yds - a.rush.yds).map(p => `<tr>${n(p)}<td>${p.rush.att}</td><td>${p.rush.yds}</td><td>${avg(p.rush.yds, p.rush.att)}</td><td>${p.rush.td}</td><td>${p.rush.long}</td><td>${p.rush.ybc ?? '—'}</td><td>${p.rush.yac ?? '—'}</td><td>${p.rush.mtf ?? '—'}</td></tr>`)); break;
      case 'RECEIVING': html = tbl(['Jogador', 'Rec', 'Alvos', 'Jds', 'Avg', 'TD', 'Long', 'Drops'], players.filter(p => p.rec.tgt).sort((a, b) => b.rec.yds - a.rec.yds).map(p => `<tr>${n(p)}<td>${p.rec.rec}</td><td>${p.rec.tgt}</td><td>${p.rec.yds}</td><td>${avg(p.rec.yds, p.rec.rec)}</td><td>${p.rec.td}</td><td>${p.rec.long}</td><td>${p.rec.drops}</td></tr>`)); break;
      case 'DEFENSE': html = tbl(['Jogador', 'Tkl', 'Ast', 'Sacks', 'INT', 'PD', 'FF', 'FR'], players.filter(p => p.def.tkl || p.def.ast || p.def.sacks || p.def.int || p.def.pd || p.def.ff || p.def.fr).sort((a, b) => (b.def.tkl + b.def.ast) - (a.def.tkl + a.def.ast)).map(p => `<tr>${n(p)}<td>${p.def.tkl}</td><td>${p.def.ast}</td><td>${p.def.sacks}</td><td>${p.def.int}</td><td>${p.def.pd}</td><td>${p.def.ff}</td><td>${p.def.fr}</td></tr>`)); break;
      case 'SCORING': html = g.scoring.length ? `<table class="table compact"><thead><tr><th>Q</th><th>Tempo</th><th>Time</th><th>Jogada</th></tr></thead><tbody>${g.scoring.map(s => `<tr><td>Q${s.q}</td><td>${s.clock}</td><td><b>${esc(s.team)}</b></td><td>${esc(s.text)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nenhum ponto ainda.</p>'; break;
    }
    $('#boxScore').innerHTML = html;
  }

  // ---------- player card (click on the field) ----------
  function drawPlayerCard() {
    const e = view.selected, el = $('#pcard');
    if (!e) { el.classList.remove('show'); return; }
    const p = e.p, { r, o } = ratingsOf(p), T = teamBy(p.team);
    const attrs = keyAttrs(p).slice(0, 6).map(a => `<div class="pc-attr"><span>${esc(a)}</span><b>${r[keyForAttribute(a)]}</b></div>`).join('');
    el.innerHTML = `<button class="pc-x" id="pcX">✕</button><div class="pc-head">${avatar(p, 'lg')}<div><b>${esc(p.full_name)}</b><div class="muted">${esc(p.position)} · #${esc(p.jersey_number || '—')} · ${esc(T?.abbr || p.team)}</div><div class="pc-slot">${esc(e.slot)} · energia ${Math.round(e.energy * 100)}%</div></div>${ovrBadge(o)}</div>
      <div class="pc-attrs">${attrs}</div>${view.debug && e.assignment?.label ? `<div class="pc-asg mono">${esc(e.assignment.label)}</div>` : ''}<a class="pc-link" href="#player/${encodeURIComponent(pid(p))}">Perfil completo →</a>`;
    el.classList.add('show');
    $('#pcX').onclick = () => { view.selected = null; drawPlayerCard(); };
  }
  canvas.addEventListener('click', ev => {
    if (!view.sim) return;
    const rect = canvas.getBoundingClientRect();
    const e = renderer.pick(ev.clientX - rect.left, ev.clientY - rect.top);
    view.selected = e && view.selected?.id !== e.id ? e : null;
    drawPlayerCard();
  });

  // ---------- debug HUD (DEBUG view only) ----------
  function drawDebug() {
    const el = $('#dbg'), s = view.sim;
    if (!view.debug || !s) { el.innerHTML = ''; el.classList.remove('show'); return; }
    const q = s.qbState;
    let t = `<b>${esc(s.call.concept)}</b> vs <b>${esc(s.call.defLabel)}</b><br>t=${s.t.toFixed(2)}s · ${s.phase} · QB ${q?.state || '-'}${q?.reads?.length ? ` · read ${Math.min(q.readIdx, q.reads.length - 1) + 1}/${q.reads.length}${q.late ? ' (late)' : ''}` : ''} · press ${(q?.pressure || 0).toFixed(2)}<br>seed ${esc(String(s.seed))} · blocks ${s.engagements.length}`;
    if (s.call.type === 'run' && s.runPlan) {
      const rb = s.off.RB, rd = s.runDebug, l = rd?.chosen;
      const dbl = s.engagements.filter(e => e.blockers.length > 1).length, climbs = s.debugEvents.filter(e => e.type === 'CLIMB').length;
      t += `<br>run ${s.runPlan.scheme} · RB ${rb.run ? `${rb.run.phase} ${rb.run.decision || '-'}` : 'mesh'}${l ? ` · lane ${l.type} (${l.score.toFixed(1)})` : ''}${rb.moveState?.cur ? ` · ${rb.moveState.cur.type}` : ''} · double ${dbl} · climb ${climbs} · free ${rd ? rd.free.length : 0}`;
    }
    if (s.phase === 'DEAD') t += `<div class="evts">${s.result.events.filter(e => e.type !== 'WHISTLE').map(e => `<span class="evt">${e.t.toFixed(2)} ${e.type}${e.reason ? ':' + e.reason : ''}</span>`).join('')}</div>`;
    el.innerHTML = t; el.classList.add('show');
  }

  // ---------- controls ----------
  function syncControls() {
    $('#pauseBtn').textContent = view.paused ? '▶' : '⏸';
    $('#pauseBtn').classList.toggle('on', view.paused);
    root.querySelectorAll('#speedSeg button').forEach(b => b.classList.toggle('on', +b.dataset.speed === view.speed));
    root.querySelectorAll('#zoomSeg button').forEach(b => b.classList.toggle('on', b.dataset.zoom === view.zoom));
    root.querySelectorAll('#viewSeg button').forEach(b => b.classList.toggle('on', (b.dataset.view === 'debug') === view.debug));
    $('#autoBtn').classList.toggle('on', view.auto);
    $('#camBtn').classList.toggle('on', view.follow);
    $('#nextBtn').disabled = view.phase === 'RUN' || g.over || view.simming;
    if ($('#simEndBtn')) $('#simEndBtn').disabled = g.over || view.simming;
  }
  const togglePause = () => { view.paused = !view.paused; syncControls(); };
  $('#pauseBtn').onclick = togglePause;
  $('#speedSeg').onclick = e => { const v = e.target.dataset.speed; if (v) { view.speed = +v; syncControls(); } };
  $('#zoomSeg').onclick = e => { const v = e.target.dataset.zoom; if (v) { view.zoom = v; syncControls(); } };
  $('#viewSeg').onclick = e => { const v = e.target.dataset.view; if (v) { view.debug = v === 'debug'; syncControls(); drawDebug(); drawPlayerCard(); } };
  $('#camBtn').onclick = () => { view.follow = !view.follow; syncControls(); };
  $('#autoBtn').onclick = () => { view.auto = !view.auto; m.auto = view.auto; syncControls(); };
  $('#nextBtn').onclick = () => { if (view.phase === 'AWAIT') runCall(cpuCall()); };
  $('#exitBtn').onclick = () => { if (m.mode === 'CAREER' && !g.over && !confirm('Sair da partida da carreira? O progresso do jogo fica salvo para continuar depois.')) return; state.match = g.over ? null : m; m.suspended = true; deps.navigate('play'); };
  $('#boxTabs').onclick = e => { const t = e.target.dataset.tab; if (t) { view.boxTab = t; root.querySelectorAll('#boxTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); drawBox(); } };
  if ($('#simEndBtn')) $('#simEndBtn').onclick = async () => {
    if (view.phase === 'RUN') return;
    view.simming = true; view.auto = false; syncControls(); drawCallPanel();
    await simulateRest(g, cache, { tuning: tuning(), onProgress: () => { drawBug(); drawLog(); } });
    view.simming = false; view.lastSum = null; $('#resultPop').classList.remove('show');
    persist(); if (g.over) onOver(); else preview();
    drawAll();
  };
  const onKey = e => {
    if (!canvas.isConnected || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === 'n' || e.key === 'N') $('#nextBtn').click();
    else if (e.key === 'd' || e.key === 'D') { view.debug = !view.debug; syncControls(); drawDebug(); }
    else if (['1', '2', '3', '4'].includes(e.key)) { view.speed = SPEEDS[+e.key - 1]; syncControls(); }
  };
  window.addEventListener('keydown', onKey);

  function drawAll() { drawBug(); drawCallPanel(); drawLog(); drawBox(); syncControls(); drawDebug(); }

  // ---------- frame loop ----------
  function cleanup() { cancelAnimationFrame(view.raf); renderer.dispose(); unmountComm(); presentation.dispose(); window.removeEventListener('keydown', onKey); if (activeCleanup === cleanup) activeCleanup = null; }
  activeCleanup = cleanup;
  let hudTick = 0;
  function frame(ts) {
    if (!canvas.isConnected) { cleanup(); return; }
    const s = view.sim;
    const dtReal = view.last ? Math.min(0.1, (ts - view.last) / 1000) : 0;
    view.last = ts;
    if (s && view.phase === 'RUN' && !view.paused) {
      view.acc += dtReal * view.speed;
      while (view.acc >= s.dt && s.phase !== 'DEAD') { step(s); view.acc -= s.dt; }
      emitLive(s);
      if (s.phase === 'DEAD') {
        if (view.deadAt === null) view.deadAt = ts;
        if (ts - view.deadAt > 600 / Math.max(1, view.speed)) { view.deadAt = null; finishPlay(); }
      }
    }
    if (view.phase === 'AWAIT' && !g.over && !view.paused && !view.simming) {
      const before = Math.ceil(view.playClock);
      view.playClock = Math.max(0, view.playClock - dtReal);
      if (Math.ceil(view.playClock) !== before) drawBug();
      const since = view.resultAt ? ts - view.resultAt : Infinity;
      if (S().display.autoAdvance !== false && since > 2600 / Math.max(1, view.speed)) $('#resultPop').classList.remove('show');
      if (view.auto && since > 1500 / Math.max(1, view.speed)) runCall(cpuCall());
    }
    if (s) {
      renderer.render(s, s.phase === 'DEAD' || view.phase !== 'RUN' ? 1 : Math.min(1, view.acc / s.dt), renderOpts());
      if (view.debug && ++hudTick % 3 === 0) drawDebug();
    }
    view.raf = requestAnimationFrame(frame);
  }

  if (sandbox) applySandboxSituation();
  preview();
  renderer.resize();
  drawAll();
  if (!view.sim) $('#callPanel').innerHTML = '<p class="muted">Roster 2026 não carregado. Use “Sincronizar” em Dados & Fotos.</p>';
  view.raf = requestAnimationFrame(frame);
  // test hook (headless smoke tests)
  window.__nflGame = { get sim() { return view.sim; }, get game() { return g; }, get phase() { return view.phase; }, runCall, cpuCall, setSpeed: v => { view.speed = v; }, setAuto: v => { view.auto = v; } };
}

// ---------- mode selection / setup ----------
function renderSetup(root, deps) {
  const { state, teamBy } = deps;
  const career = deps.career();
  const pref = state.setup ||= { mode: 'QUICK', home: career?.team || 'SEA', away: 'NE', side: 'home', seed: '' };
  const tOpts = sel => state.teams.map(t => `<option value="${t.abbr}" ${sel === t.abbr ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const suspended = state.match?.suspended && state.match.g && !state.match.g.over ? state.match : null;
  const nextG = deps.careerNext();
  root.innerHTML = `${suspended ? `<div class="panel resume"><b>Partida em andamento:</b> ${esc(suspended.g.away)} ${suspended.g.awayScore} x ${suspended.g.homeScore} ${esc(suspended.g.home)} · ${esc(MODES[suspended.mode].label)} <button class="primary" id="resume">Continuar</button><button id="discard">Descartar</button></div>` : ''}
  <div class="mode-grid">${Object.entries(MODES).map(([k, v]) => `<button class="mode-card ${pref.mode === k ? 'on' : ''}" data-mode="${k}"><span class="mode-ic">${v.icon}</span><b>${v.label}</b><small>${v.desc}</small></button>`).join('')}</div>
  <div class="panel setup-panel" id="setup"></div>`;
  const $ = s => root.querySelector(s);
  function drawForm() {
    const md = pref.mode;
    let html = '';
    if (md === 'CAREER') {
      if (!career) html = `<p>Nenhuma carreira ativa.</p><button class="primary" id="goCareer">Criar / carregar carreira</button>`;
      else if (!nextG) html = `<p>Temporada regular encerrada (${career.wins}-${career.losses}).</p>`;
      else {
        const opp = teamBy(nextG.opp), me = teamBy(career.team);
        html = `<div class="matchup">${teamLogo(nextG.home ? opp : me, 'lg')}<div><small class="muted">Semana ${nextG.week}</small><h3>${esc(nextG.home ? opp.abbr : me.abbr)} @ ${esc(nextG.home ? me.abbr : opp.abbr)}</h3></div>${teamLogo(nextG.home ? me : opp, 'lg')}</div>
          <div class="call-actions"><button class="primary" data-start="CAREER_COACH">📋 Jogar como técnico</button><button data-start="CAREER_WATCH">📺 Assistir (CPU)</button><button data-start="CAREER_SIM">⏭ Simular com o motor</button></div><p class="muted" id="simMsg"></p>`;
      }
    } else {
      html = `<div class="form-row"><label>Visitante<select id="awaySel">${tOpts(pref.away)}</select></label><span class="at">@</span><label>Mandante<select id="homeSel">${tOpts(pref.home)}</select></label>
        ${md === 'COACH' ? `<label>Seu time<select id="sideSel"><option value="home" ${pref.side === 'home' ? 'selected' : ''}>Mandante</option><option value="away" ${pref.side === 'away' ? 'selected' : ''}>Visitante</option></select></label>` : ''}
        <label>Seed<input id="seedIn" placeholder="aleatória" value="${esc(pref.seed)}" size="12"></label></div>
        <div class="matchup">${teamLogo(teamBy(pref.away), 'lg')}<h3>${esc(pref.away)} @ ${esc(pref.home)}</h3>${teamLogo(teamBy(pref.home), 'lg')}</div>
        <div class="call-actions"><button class="primary" data-start="${md}">Iniciar ${esc(MODES[md].label)} ▶</button></div>`;
    }
    $('#setup').innerHTML = html;
    const bind = (id, k) => { const el = $(id); if (el) el.onchange = () => { pref[k] = el.value; drawForm(); }; };
    bind('#awaySel', 'away'); bind('#homeSel', 'home'); bind('#sideSel', 'side');
    if ($('#seedIn')) $('#seedIn').oninput = e => { pref.seed = e.target.value.trim(); };
    if ($('#goCareer')) $('#goCareer').onclick = () => deps.navigate('career');
    root.querySelectorAll('[data-start]').forEach(b => b.onclick = () => start(b.dataset.start));
  }
  async function start(kind) {
    const quarterMin = deps.settings().gameplay.quarterMin;
    if (kind.startsWith('CAREER')) {
      const me = career.team, home = nextG.home ? me : nextG.opp, away = nextG.home ? nextG.opp : me;
      const seed = `${career.seed}-W${nextG.week}`;
      if (kind === 'CAREER_SIM') {
        $('#simMsg').textContent = 'Simulando jogada a jogada com o motor…';
        const g = await deps.simCareerGame({ home, away, seed, quarterMin });
        $('#simMsg').textContent = `Final: ${g.away} ${g.awayScore} x ${g.homeScore} ${g.home}`;
        return;
      }
      // CAREER_WATCH: nobody calls plays (userTeam matches no team) and Auto Play is on.
      state.match = { mode: 'CAREER', userTeam: kind === 'CAREER_COACH' ? me : '__cpu__', auto: kind === 'CAREER_WATCH', week: nextG.week, g: newGameState({ home, away, seed, quarterMin }), roster: deps.careerRoster };
    } else {
      const seed = pref.seed || undefined;
      state.match = { mode: kind, userTeam: kind === 'COACH' ? (pref.side === 'home' ? pref.home : pref.away) : null, g: newGameState({ home: pref.home, away: pref.away, seed, quarterMin }) };
      if (kind === 'SANDBOX') state.match.sandbox = { down: 1, distance: 10, ballOn: 30, lockSeed: false, n: 0 };
    }
    mountGame(root, deps);
  }
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { pref.mode = b.dataset.mode; root.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); drawForm(); });
  if ($('#resume')) $('#resume').onclick = () => { state.match.suspended = false; mountGame(root, deps); };
  if ($('#discard')) $('#discard').onclick = () => { state.match = null; renderSetup(root, deps); };
  drawForm();
}
