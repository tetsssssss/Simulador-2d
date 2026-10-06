// Partida 2D: drives the play simulator with a fixed simulation clock (SIM_HZ) decoupled from the render clock,
// applies results to the game state (downs, possession, score, clock) and keeps a box score fed only by events.
import { buildLineups } from '../nflEngine.js';
import { createPlay, step, SIM_HZ } from '../sim/playSim.js';
import { emptyBox, applyPlayEvents } from '../sim/stats.js';
import { createRenderer } from './fieldRenderer.js';

const OUTCOME_PT = { COMPLETE: 'Passe completo', INCOMPLETE: 'Passe incompleto', INTERCEPTION: 'Interceptação', SACK: 'Sack', RUSH: 'Corrida', SCRAMBLE: 'Scramble', FUMBLE_LOST: 'Fumble perdido' };
const INC_PT = { DROP: 'drop', BREAKUP: 'passe desviado', DEFLECTED: 'bola tocada na linha/rota', OVERTHROWN: 'passou do alvo', UNCATCHABLE: 'bola fora do alcance', INCOMPLETE: 'não completou', OUT_OF_BOUNDS: 'fora de campo', THROWAWAY: 'jogada fora' };

export function newGameState(prev = {}) {
  return {
    home: prev.home || 'SEA', away: prev.away || 'NE', homeScore: 0, awayScore: 0, down: 1, distance: 10, ballOn: 25,
    possession: 'home', log: [], quarter: 1, clock: 900, seed: prev.seed || `G${Date.now().toString(36).toUpperCase()}`,
    playNo: 0, box: emptyBox(), energy: {}, over: false, lastEvents: [],
  };
}

export function mountGame(root, deps) {
  const { state, teamBy, logoUrl, esc, toast } = deps;
  if (!state.game.box) state.game = newGameState(state.game);
  const g = state.game;
  const view = { sim: null, raf: 0, acc: 0, last: 0, speed: 1, debug: false, zoom: 'medium', running: false, deadAt: null };
  const teamOpts = sel => state.teams.map(t => `<option value="${t.abbr}" ${sel === t.abbr ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  root.innerHTML = `<div class="card game-card">
    <div class="toolbar"><select id="awaySel">${teamOpts(g.away)}</select><span class="muted">@</span><select id="homeSel">${teamOpts(g.home)}</select>
      <button id="resetGame">Reiniciar jogo</button>
      <label class="muted seed-label">Seed <input id="seedInput" value="${esc(g.seed)}" size="12"></label></div>
    <div class="scoreboard" id="score"></div>
    <div class="field-canvas-wrap"><canvas id="fieldCanvas"></canvas><div class="sim-hud" id="hud"></div></div>
    <div class="toolbar game-controls">
      <button class="primary play" data-play="run">Corrida</button><button class="primary play" data-play="pass">Passe</button><button class="primary play" data-play="deep">Passe profundo</button>
      <span class="sep"></span>
      <label class="muted">Velocidade <select id="speedSel"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="4">4x</option></select></label>
      <label class="muted">Zoom <select id="zoomSel"><option value="close">Próximo (fotos)</option><option value="medium" selected>Médio</option><option value="full">Campo inteiro</option></select></label>
      <label class="muted"><input type="checkbox" id="debugChk"> Debug</label>
    </div>
    <div class="grid two"><div class="card"><b>Situação</b><div id="situation"></div><div id="playEvents" class="play-events"></div></div><div class="card playlog" id="log"></div></div>
    <div class="card" style="margin-top:12px"><h3>Box score <small class="muted">(derivado apenas de eventos da simulação)</small></h3><div id="boxScore"></div></div>
  </div>`;
  const $ = s => root.querySelector(s);
  const canvas = $('#fieldCanvas');
  const renderer = createRenderer(canvas);
  const onResize = () => { renderer.resize(); if (view.sim) renderer.render(view.sim, 1, renderOpts()); };
  window.addEventListener('resize', onResize);

  const offAbbr = () => (g.possession === 'home' ? g.home : g.away);
  const defAbbr = () => (g.possession === 'home' ? g.away : g.home);
  const renderOpts = () => ({ debug: view.debug, zoom: view.zoom, teams: { off: offAbbr(), def: defAbbr() } });
  const lineupCache = new Map();
  function lineups() {
    const key = `${offAbbr()}|${defAbbr()}|${state.roster.length}`;
    if (!lineupCache.has(key)) lineupCache.set(key, buildLineups(state.roster, offAbbr(), defAbbr()));
    return lineupCache.get(key);
  }
  function who() {
    const m = {}, ls = lineups();
    for (const p of ls.offense) m[p.gsis_id || p.full_name] = { name: p.full_name, team: offAbbr(), pos: p.position };
    for (const p of ls.defense) m[p.gsis_id || p.full_name] = { name: p.full_name, team: defAbbr(), pos: p.position };
    return m;
  }

  function preSnap(playType = 'pass') {
    if (!state.roster.length) return null;
    const ls = lineups();
    if (ls.offense.length < 11 || ls.defense.length < 11) return null;
    try {
      return createPlay({ offense: ls.offense, defense: ls.defense, ballOn: g.ballOn, down: g.down, distance: g.distance, playType, seed: `${g.seed}-${g.playNo + 1}-${playType}`, energy: g.energy });
    } catch (e) { toast(e.message); return null; }
  }

  function clockText() { const m = Math.floor(g.clock / 60), s = Math.floor(g.clock % 60); return `Q${Math.min(4, g.quarter)} · ${m}:${String(s).padStart(2, '0')}`; }
  function drawScore() {
    const H = teamBy(g.home), A = teamBy(g.away);
    const ball = t => (offAbbr() === t ? ' 🏈' : '');
    $('#score').innerHTML = `<div class="score-team"><img src="${logoUrl(A)}" alt=""><b>${A.abbr}${ball(A.abbr)}</b><span class="score">${g.awayScore}</span></div><div class="muted">${g.over ? 'FINAL' : clockText()}</div><div class="score-team right"><span class="score">${g.homeScore}</span><b>${H.abbr}${ball(H.abbr)}</b><img src="${logoUrl(H)}" alt=""></div>`;
    const side = g.ballOn <= 50 ? `${offAbbr()} ${g.ballOn}` : `${defAbbr()} ${100 - g.ballOn}`;
    $('#situation').innerHTML = `<p><b>${g.down}ª descida & ${g.ballOn + g.distance >= 100 ? 'Goal' : g.distance}</b> · bola na ${side} · ataque: <b>${offAbbr()}</b></p>`;
    $('#log').innerHTML = (g.log.length ? g.log : ['Selecione uma jogada para iniciar.']).slice(0, 60).map(x => `<div class="logline">${esc(x)}</div>`).join('');
    drawBox();
  }

  function drawBox() {
    const players = Object.values(g.box.players);
    const tbl = (title, rows, head) => rows.length ? `<div class="box-block"><h4>${title}</h4><table class="table compact"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
    const pass = players.filter(p => p.pass.att || p.pass.sacks).map(p => `<tr><td>${esc(p.name)} <small class="muted">${p.team}</small></td><td>${p.pass.cmp}/${p.pass.att}</td><td>${p.pass.yds}</td><td>${p.pass.td}</td><td>${p.pass.int}</td><td>${p.pass.sacks}-${p.pass.sackYds}</td></tr>`);
    const rush = players.filter(p => p.rush.att).map(p => `<tr><td>${esc(p.name)} <small class="muted">${p.team}</small></td><td>${p.rush.att}</td><td>${p.rush.yds}</td><td>${p.rush.td}</td><td>${p.rush.long}</td></tr>`);
    const rec = players.filter(p => p.rec.tgt).sort((a, b) => b.rec.yds - a.rec.yds).map(p => `<tr><td>${esc(p.name)} <small class="muted">${p.team}</small></td><td>${p.rec.rec}/${p.rec.tgt}</td><td>${p.rec.yds}</td><td>${p.rec.td}</td><td>${p.rec.long}</td><td>${p.rec.drops}</td></tr>`);
    const def = players.filter(p => p.def.tkl || p.def.ast || p.def.sacks || p.def.int || p.def.pd || p.def.ff).sort((a, b) => b.def.tkl - a.def.tkl).map(p => `<tr><td>${esc(p.name)} <small class="muted">${p.team}</small></td><td>${p.def.tkl}</td><td>${p.def.ast}</td><td>${p.def.sacks}</td><td>${p.def.int}</td><td>${p.def.pd}</td><td>${p.def.ff}</td></tr>`);
    const html = tbl('Passe', pass, ['Jogador', 'C/A', 'Jds', 'TD', 'INT', 'Sacks']) + tbl('Corrida', rush, ['Jogador', 'Att', 'Jds', 'TD', 'Long']) + tbl('Recepção', rec, ['Jogador', 'Rec/Alvos', 'Jds', 'TD', 'Long', 'Drops']) + tbl('Defesa', def, ['Jogador', 'Tkl', 'Ast', 'Sacks', 'INT', 'PD', 'FF']);
    $('#boxScore').innerHTML = html || '<p class="muted">Sem estatísticas ainda.</p>';
  }

  function hud() {
    const s = view.sim; if (!s) { $('#hud').innerHTML = ''; return; }
    const q = s.qbState;
    const base = `<b>${s.call.concept}</b> vs <b>${s.call.defLabel}</b>`;
    $('#hud').innerHTML = view.debug
      ? `${base}<br>t=${s.t.toFixed(2)}s · fase ${s.phase} · QB ${q?.state || '-'}${q?.reads?.length ? ` · leitura ${Math.min(q.readIdx, q.reads.length - 1) + 1}/${q.reads.length}${q.late ? ' (tardia)' : ''}` : ''} · pressão ${(q?.pressure || 0).toFixed(2)}<br>seed ${esc(String(s.seed))} · bloqueios ativos ${s.engagements.length}`
      : base;
  }

  function name(id) { const p = who()[id]; return p ? p.name : id; }
  function describe(r) {
    const ev = r.events, f = t => ev.find(e => e.type === t);
    const pa = f('PASS_ATTEMPT'), tk = f('TACKLE'), by = tk ? ` (tackle: ${name(tk.by)})` : '';
    switch (r.outcome) {
      case 'COMPLETE': return `${name(pa.passer)} → ${name(f('PASS_COMPLETE').receiver)}, ${r.yards} jardas${by}`;
      case 'INCOMPLETE': { const i = f('INCOMPLETE'); return pa?.throwAway ? `${name(pa.passer)} joga a bola fora` : `Incompleto para ${name(pa.target)} (${INC_PT[i?.reason] || i?.reason}${i?.by && i.reason === 'BREAKUP' ? `: ${name(i.by)}` : ''})`; }
      case 'INTERCEPTION': return `INTERCEPTAÇÃO de ${name(f('INTERCEPTION').by)}!`;
      case 'SACK': { const s = f('SACK'); return `SACK${s?.by ? ` de ${name(s.by)}` : ''}: ${r.yards} jardas`; }
      case 'SCRAMBLE': return `Scramble de ${name(f('SCRAMBLE')?.id)}: ${r.yards} jardas${by}`;
      case 'RUSH': return `${name(f('HANDOFF')?.to)}: corrida de ${r.yards} jardas${by}`;
      case 'FUMBLE_LOST': return `FUMBLE! Recuperado por ${name(f('FUMBLE_RECOVERY')?.by)}`;
      default: return r.outcome;
    }
  }

  function applyResult(r) {
    const off = offAbbr(), def = defAbbr();
    applyPlayEvents(g.box, r.events, who(), off);
    for (const e of view.sim.ents) g.energy[e.id] = Math.min(1, e.energy + 0.06); // partial recovery between plays
    g.playNo++;
    const text = `${g.down}ª & ${g.distance} · ${off}: ${describe(r)}`;
    const add = (pts, team) => { if (team === g.home) g.homeScore += pts; else g.awayScore += pts; };
    const flip = ballOn => { g.possession = g.possession === 'home' ? 'away' : 'home'; g.down = 1; g.ballOn = Math.max(1, Math.min(99, ballOn)); g.distance = Math.min(10, 100 - g.ballOn); };
    g.log.unshift(text);
    if (r.touchdown === 'off') { add(7, off); g.log.unshift(`TOUCHDOWN ${off}! (+6, PAT automático +1)`); flip(25); }
    else if (r.touchdown === 'def') { add(7, def); g.log.unshift(`TOUCHDOWN DEFENSIVO ${def}! (+7)`); g.down = 1; g.ballOn = 25; g.distance = 10; }
    else if (r.safety) { add(2, def); g.log.unshift(`SAFETY! +2 ${def}`); flip(35); }
    else if (r.turnover) { const spot = r.spotX >= 110 ? 20 : 110 - r.spotX; g.log.unshift(`Posse para ${def}`); flip(Math.round(spot)); }
    else {
      g.ballOn = Math.round(r.spotX - 10);
      if (r.yards >= g.distance) { g.down = 1; g.distance = Math.min(10, 100 - g.ballOn); if (r.yards > 0) g.log.unshift('Primeira descida!'); }
      else {
        g.distance -= r.yards; g.down++;
        if (g.down > 4) { g.log.unshift(`Turnover on downs — posse para ${def}`); flip(100 - g.ballOn); }
      }
    }
    // Game clock: play time, plus runoff when the clock keeps running.
    g.clock -= r.duration + (r.clockStops ? 0 : 25);
    if (g.clock <= 0) {
      if (g.quarter >= 4) { g.clock = 0; g.over = true; g.log.unshift(`FIM DE JOGO: ${g.away} ${g.awayScore} x ${g.homeScore} ${g.home}`); }
      else { g.quarter++; g.clock = 900; g.log.unshift(`Início do ${g.quarter}º quarto`); if (g.quarter === 3) { g.possession = 'away'; g.down = 1; g.distance = 10; g.ballOn = 25; } }
    }
    g.lastEvents = r.events;
  }

  function showEvents(events) {
    const hide = new Set(['WHISTLE']);
    $('#playEvents').innerHTML = events.length ? `<div class="muted" style="margin-top:8px">Eventos da jogada:</div>` + events.filter(e => !hide.has(e.type)).map(e => `<span class="evt">${e.t.toFixed(2)}s ${e.type}${e.reason ? `:${e.reason}` : ''}</span>`).join('') : '';
  }

  function setButtons(on) { root.querySelectorAll('.play').forEach(b => { b.disabled = !on || g.over; }); }

  function frame(ts) {
    if (!canvas.isConnected) { cancelAnimationFrame(view.raf); window.removeEventListener('resize', onResize); return; }
    const s = view.sim;
    const dtReal = view.last ? Math.min(0.1, (ts - view.last) / 1000) : 0;
    view.last = ts;
    if (s && view.running) {
      view.acc += dtReal * view.speed;
      while (view.acc >= s.dt && s.phase !== 'DEAD') { step(s); view.acc -= s.dt; }
      if (s.phase === 'DEAD') {
        if (view.deadAt === null) view.deadAt = ts;
        if (ts - view.deadAt > 700 / Math.max(1, view.speed)) {
          view.running = false; view.deadAt = null;
          applyResult(s.result); drawScore(); showEvents(s.result.events); setButtons(true);
        }
      }
    }
    if (s) { renderer.render(s, s.phase === 'DEAD' || !view.running ? 1 : Math.min(1, view.acc / s.dt), renderOpts()); hud(); }
    view.raf = requestAnimationFrame(frame);
  }

  function runPlay(type) {
    if (g.over) return;
    const s = preSnap(type);
    if (!s) { toast('Roster indisponível: sincronize ou importe o roster 2026 em Dados & Fotos.'); return; }
    view.sim = s; view.acc = 0; view.running = true; view.deadAt = null;
    setButtons(false);
  }

  function reset(full) {
    if (full) state.game = Object.assign(g, newGameState({ home: g.home, away: g.away, seed: $('#seedInput').value.trim() || undefined }));
    else { g.box = emptyBox(); }
    lineupCache.clear();
    view.sim = preSnap('pass'); view.running = false;
    drawScore(); showEvents([]); setButtons(true);
  }

  $('#awaySel').onchange = e => { g.away = e.target.value; reset(true); };
  $('#homeSel').onchange = e => { g.home = e.target.value; reset(true); };
  $('#resetGame').onclick = () => reset(true);
  $('#seedInput').onchange = () => reset(true);
  $('#speedSel').onchange = e => { view.speed = Number(e.target.value); };
  $('#zoomSel').onchange = e => { view.zoom = e.target.value; };
  $('#debugChk').onchange = e => { view.debug = e.target.checked; };
  root.querySelectorAll('.play').forEach(b => b.onclick = () => runPlay(b.dataset.play));
  view.sim = preSnap('pass');
  if (!view.sim) $('#hud').innerHTML = 'Roster 2026 não carregado. Use “Sincronizar roster 2026” ou importe o CSV.';
  drawScore(); setButtons(!!view.sim);
  renderer.resize();
  view.raf = requestAnimationFrame(frame);
  // test hook (headless smoke tests)
  window.__nflGame = { get sim() { return view.sim; }, get game() { return g; }, runPlay, setSpeed: v => { view.speed = v; } };
}
