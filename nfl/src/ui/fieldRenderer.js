// Canvas renderer for the play simulation. Pure presentation: reads sim state, never changes it.
// Zoom levels: close = photo + number, medium = jersey + number, far = dot + number.
// Debug overlay: assignments, routes, QB reads, blocks (leverage), coverage, ball trajectory, run game
// (lanes + scores, chosen lane, RB decision/move, double teams, climbs/pulls, free defenders).
import { photoImage } from './photos.js';
import { drawSprite } from '../../../core/render/sprites.js';
import { getAvatar } from '../../../core/render/avatars.js';
import { FIELD_LEN, FIELD_W } from '../sim/geometry.js';
import { attachHiDPI } from '../../../core/render/hidpi.js';
import { TEAM_COLORS } from './teamColors.js';

// Photos come from the central NFLPlayerPhotoResolver (./photos.js) — kept exported here for compatibility.
export { photoImage as photoFor } from './photos.js';

export const ZOOMS = { close: 34, medium: 56, full: 120 }; // visible yards across

export function createRenderer(canvas, { crowd = null } = {}) {
  // HiDPI: CSS size for layout/drawing math, backing store = CSS × devicePixelRatio (crisp on 1980px / 4K / Retina).
  const hd = attachHiDPI(canvas, { minW: 300, minH: 180 });
  const ctx = hd.ctx;
  const cam = { x: 35, y: FIELD_W / 2, zoom: 'medium', init: false };
  let W = hd.w, H = hd.h;
  let screen = new Map(), prefs = { photos: true, visual: 'photo', follow: true, selected: null };
  let teamCols = { off: ['#1d4ed8', '#ffffff'], def: ['#b91c1c', '#ffffff'] }, lastSim = null;

  function resize() { hd.measure(); W = hd.w; H = hd.h; }

  function ppy() { return W / ZOOMS[cam.zoom]; }
  function sx(x) { return (x - cam.x) * ppy() + W / 2; }
  function sy(y) { return (y - cam.y) * ppy() + H / 2; }

  function updateCamera(sim, alpha) {
    const s = ppy();
    const viewW = W / s, viewH = H / s;
    let fx = sim.losX + 6, fy = FIELD_W / 2;
    const focus = !prefs.follow ? null : sim.ball ? sim.ball.pos : sim.carrier ? sim.carrier.pos : null;
    if (focus) { fx = focus.x; fy = 0.6 * focus.y + 0.4 * (FIELD_W / 2); }
    if (cam.zoom === 'full') { fx = FIELD_LEN / 2; fy = FIELD_W / 2; }
    const clampX = v => viewW >= FIELD_LEN + 6 ? FIELD_LEN / 2 : Math.min(FIELD_LEN + 3 - viewW / 2, Math.max(viewW / 2 - 3, v));
    const my = crowd ? 13 : 8; // with stands, the camera may show a few rows beyond the team areas
    const clampY = v => viewH >= FIELD_W + 2 * my ? FIELD_W / 2 : Math.min(FIELD_W + my - viewH / 2, Math.max(viewH / 2 - my, v));
    const tx = clampX(fx), ty = clampY(fy);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    const k = Math.min(1, 0.12 * alpha + 0.04);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }

  function drawField(sim, teams) {
    const s = ppy();
    const col = abbr => TEAM_COLORS[abbr] || '#24364d';
    // surroundings: team areas (between the 32-yard lines), white 2-yd border
    ctx.fillStyle = '#123f24'; ctx.fillRect(0, 0, W, H);
    if (crowd) { ctx.fillStyle = '#0b1219'; ctx.fillRect(0, 0, W, sy(-8.2)); ctx.fillRect(0, sy(FIELD_W + 8.2), W, H); crowd.draw(ctx, { cam: { sx, sy, scale: s }, t: performance.now() / 1000, view: { w: W, h: H } }); }
    ctx.fillStyle = '#f2f5f8'; ctx.fillRect(sx(-2), sy(-2), (FIELD_LEN + 4) * s, (FIELD_W + 4) * s);
    const bench = (yTop, abbr) => {
      ctx.fillStyle = hexA(col(abbr), 0.55); ctx.fillRect(sx(42), sy(yTop), 36 * s, 4.5 * s);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.strokeRect(sx(42), sy(yTop), 36 * s, 4.5 * s);
      if (s > 4) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `800 ${Math.max(9, s * 1.6)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${abbr || ''} TEAM AREA`, sx(60), sy(yTop + 2.25)); }
    };
    if (teams.home) bench(FIELD_W + 3, teams.home);
    if (teams.away) bench(-7.5, teams.away);
    // playing field with 5-yard mowing stripes
    ctx.fillStyle = '#1b5e35'; ctx.fillRect(sx(0), sy(0), FIELD_LEN * s, FIELD_W * s);
    for (let x = 10; x < 110; x += 5) if ((x / 5) % 2) { ctx.fillStyle = '#1f6a3c'; ctx.fillRect(sx(x), sy(0), 5 * s, FIELD_W * s); }
    // end zones in team colors (offense defends the left one, attacks the right one)
    const ez = (x0, abbr) => {
      ctx.fillStyle = col(abbr); ctx.fillRect(sx(x0), sy(0), 10 * s, FIELD_W * s);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(sx(x0), sy(0), 10 * s, FIELD_W * s);
      ctx.save(); ctx.translate(sx(x0 + 5), sy(FIELD_W / 2)); ctx.rotate(x0 < 60 ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `900 ${Math.max(10, s * 4.2)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(abbr || '', 0, 0); ctx.restore();
    };
    ez(0, teams.off); ez(110, teams.def);
    // yard lines, hash marks (NFL hashes 70'9" from each sideline), sideline ticks
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, s * 0.11);
    for (let x = 10; x <= 110; x += 5) { ctx.beginPath(); ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(FIELD_W)); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, s * 0.08);
    for (let x = 11; x < 110; x++) {
      if (x % 5 === 0) continue;
      for (const hy of [0.35, 23.58, 29.75, FIELD_W - 0.35]) { ctx.beginPath(); ctx.moveTo(sx(x), sy(hy - 0.35)); ctx.lineTo(sx(x), sy(hy + 0.35)); ctx.stroke(); }
    }
    // goal lines (thicker) and the 2-pt try line
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, s * 0.22);
    for (const x of [10, 110]) { ctx.beginPath(); ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(FIELD_W)); ctx.stroke(); }
    for (const x of [12, 108]) { ctx.beginPath(); ctx.moveTo(sx(x), sy(FIELD_W / 2 - 0.5)); ctx.lineTo(sx(x), sy(FIELD_W / 2 + 0.5)); ctx.stroke(); }
    // yard numbers (with direction arrows toward the nearest goal line)
    if (s > 5) {
      ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = `800 ${Math.max(10, s * 2)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let x = 20; x <= 100; x += 10) {
        const n = x <= 60 ? x - 10 : 110 - x;
        for (const [yy, rot] of [[FIELD_W - 10.5, 0], [10.5, Math.PI]]) {
          ctx.save(); ctx.translate(sx(x), sy(yy)); ctx.rotate(rot); ctx.fillText(String(n), 0, 0);
          if (n !== 50) { const dir = (x < 60 ? -1 : 1) * (rot ? -1 : 1); const ax = dir * s * 2.6; ctx.beginPath(); ctx.moveTo(ax + dir * s * 0.7, 0); ctx.lineTo(ax, -s * 0.45); ctx.lineTo(ax, s * 0.45); ctx.closePath(); ctx.fill(); }
          ctx.restore();
        }
      }
    }
    // midfield mark (home team)
    if (teams.home && s > 3) {
      ctx.fillStyle = hexA(col(teams.home), 0.55); ctx.beginPath(); ctx.arc(sx(60), sy(FIELD_W / 2), 5 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `900 ${Math.max(10, s * 2.6)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(teams.home, sx(60), sy(FIELD_W / 2));
    }
    // pylons (8) and goalposts on the end lines (top-down: post + 18'6" crossbar)
    ctx.fillStyle = '#ff7a1a';
    for (const x of [0, 10, 110, 120]) for (const y of [0, FIELD_W]) { const w = Math.max(3, s * 0.45); ctx.fillRect(sx(x) - w / 2, sy(y) - w / 2, w, w); }
    ctx.strokeStyle = '#f5d33a'; ctx.lineWidth = Math.max(2, s * 0.22);
    for (const [x, d] of [[0, -1], [120, 1]]) {
      ctx.beginPath(); ctx.moveTo(sx(x + d * 0.6), sy(FIELD_W / 2 - 3.08)); ctx.lineTo(sx(x + d * 0.6), sy(FIELD_W / 2 + 3.08)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx(x + d * 0.6), sy(FIELD_W / 2)); ctx.lineTo(sx(x + d * 1.6), sy(FIELD_W / 2)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(1.5, s * 0.12); ctx.strokeRect(sx(0), sy(0), FIELD_LEN * s, FIELD_W * s);
    // line of scrimmage (blue) and line to gain (yellow) + sideline down markers (chains)
    const gain = Math.min(110, sim.losX + sim.distance);
    ctx.lineWidth = Math.max(2, s * 0.2);
    ctx.strokeStyle = '#4ea1ff'; ctx.beginPath(); ctx.moveTo(sx(sim.losX), sy(0)); ctx.lineTo(sx(sim.losX), sy(FIELD_W)); ctx.stroke();
    if (gain < 110) { ctx.strokeStyle = '#f6c453'; ctx.beginPath(); ctx.moveTo(sx(gain), sy(0)); ctx.lineTo(sx(gain), sy(FIELD_W)); ctx.stroke(); }
    const marker = (x, txt, bg) => {
      const w = Math.max(14, s * 1.6), h = Math.max(12, s * 1.2), y = sy(FIELD_W + 1.1);
      ctx.fillStyle = bg; ctx.fillRect(sx(x) - w / 2, y - h / 2, w, h);
      ctx.fillStyle = '#111'; ctx.font = `900 ${Math.max(9, h * 0.75)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, sx(x), y + 0.5);
    };
    marker(sim.losX, String(sim.down || ''), '#ff8a1a');
    if (gain < 110) { marker(gain, '▮', '#ff8a1a'); ctx.strokeStyle = 'rgba(255,138,26,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx(sim.losX), sy(FIELD_W + 1.1)); ctx.lineTo(sx(gain), sy(FIELD_W + 1.1)); ctx.stroke(); ctx.setLineDash([]); }
  }

  function lerpPos(e, a) { return { x: e.prev.x + (e.pos.x - e.prev.x) * a, y: e.prev.y + (e.pos.y - e.prev.y) * a }; }

  // Shared sprite grammar: far = team color + number · mid = photo + number (+ position) · close = photo + name.
  // QB gets a role outline, the ball carrier a gold ring; offense/defense use their real team colors.
  function drawPlayer(e, a, isCarrier) {
    const s = ppy();
    const p = lerpPos(e, a);
    const X = sx(p.x), Y = sy(p.y);
    const level = s >= 17 ? 'close' : s >= 9 ? 'mid' : 'far';
    const av = prefs.visual === 'avatar';
    const r = (level === 'close' ? Math.min(22, s * 0.62) : level === 'mid' ? Math.max(9.5, s * 0.5) : Math.max(5, s * 0.55)) * (av ? 1.35 : 1);
    const off = e.side === 'off';
    const c = off ? teamCols.off : teamCols.def;
    const qb = e === lastSim?.qb;
    drawSprite(ctx, {
      x: X, y: Y, r, color: c[0], color2: c[1], number: e.jersey || '', pos: e.slot, name: level === 'close' ? lastName(e.name) : '',
      img: prefs.visual === 'photo' && level !== 'far' ? photoImage(e.p) : null,
      avatar: av ? { opts: getAvatar('nfl', e.p?.gsis_id || e.p?.full_name || e.id), kit: 'football', role: qb ? 'qb' : 'player', prop: isCarrier || qb ? 'ball' : 'none', pose: 'stand', moving: Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y) > 0.03, seed: (e.jersey || 0) % 9, dir: e.side === 'off' ? 1 : -1 } : null, shape: qb ? 'pitcher' : 'circle', facing: e.facing,
      carrier: isCarrier, selected: prefs.selected === e.id, dim: e.down, level, t: performance.now() / 1000,
    });
    return { X, Y, r };
  }

  function drawBall(sim, a) {
    const b = sim.ball;
    const s = ppy();
    let x, y, z = 0;
    if (b) {
      const pv = b.prev || { x: b.pos.x, y: b.pos.y, z: b.z };
      x = pv.x + (b.pos.x - pv.x) * a; y = pv.y + (b.pos.y - pv.y) * a; z = Math.max(0, pv.z + (b.z - pv.z) * a);
    } else {
      const h = sim.carrier || (sim.phase === 'PRE_THROW' || sim.phase === 'SCRAMBLE' || sim.phase === 'HANDOFF' ? sim.qb : null);
      if (!h) return;
      const p = lerpPos(h, a); x = p.x + 0.35; y = p.y + 0.2; z = 1.1;
    }
    // shadow on the ground, ball raised by height
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(sx(x), sy(y), Math.max(2, s * 0.22), Math.max(1.5, s * 0.14), 0, 0, Math.PI * 2); ctx.fill();
    const lift = z * s * 0.55;
    const size = Math.max(3, s * (0.22 + z * 0.02));
    ctx.fillStyle = '#8b4513'; ctx.strokeStyle = '#f1c27d'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(sx(x), sy(y) - lift, size * 1.5, size, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function label(text, X, Y, color = '#fff', bg = 'rgba(0,0,0,.65)') {
    ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 6;
    ctx.fillStyle = bg; ctx.fillRect(X - w / 2, Y - 7, w, 14);
    ctx.fillStyle = color; ctx.fillText(text, X, Y);
  }

  function drawDebug(sim, a, screen) {
    const s = ppy();
    ctx.save();
    // routes (planned geometry)
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    for (const r of sim.receivers) {
      if (!r.route || r.route.block || r.assignment?.type === 'PASS_PRO') continue;
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      const start = r.hist[0] || r.pos;
      ctx.beginPath();
      ctx.moveTo(sx(start.x), sy(start.y));
      for (const p of r.route.pts) ctx.lineTo(sx(p.x), sy(p.y));
      ctx.stroke();
    }
    // man coverage links + zone landmarks
    for (const d of sim.defense) {
      const A = d.assignment; if (!A) continue;
      if (A.type === 'MAN' && A.target) {
        ctx.strokeStyle = 'rgba(255,120,120,.6)'; ctx.beginPath(); ctx.moveTo(sx(d.pos.x), sy(d.pos.y)); ctx.lineTo(sx(A.target.pos.x), sy(A.target.pos.y)); ctx.stroke();
      } else if (A.type === 'ZONE') {
        const z = A.zone;
        ctx.strokeStyle = z.deep ? 'rgba(120,180,255,.5)' : 'rgba(255,220,120,.5)';
        ctx.strokeRect(sx(sim.losX + (z.deep ? 10 : 1)), sy(z.y0), (z.deep ? 14 : z.x - sim.losX + 5) * s, (z.y1 - z.y0) * s);
      }
    }
    ctx.setLineDash([]);
    // blocks: line colored by leverage (green = blocker winning, red = defender winning)
    for (const eng of sim.engagements) {
      const lev = Math.max(-1, Math.min(1, eng.lev));
      const col = lev > 0 ? `rgba(255,${Math.round(200 - 160 * lev)},60,.95)` : `rgba(${Math.round(200 + 55 * lev)},255,90,.95)`;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (const b of eng.blockers) { ctx.beginPath(); ctx.moveTo(sx(b.pos.x), sy(b.pos.y)); ctx.lineTo(sx(eng.def.pos.x), sy(eng.def.pos.y)); ctx.stroke(); }
    }
    // Run game: double teams (thick + "2x"), climbs off a double (dashed arrow to the backer).
    for (const eng of sim.engagements) {
      if (eng.blockers.length < 2) continue;
      label(`2x ${eng.double?.phase || 'DOUBLE'}`, sx(eng.def.pos.x) , sy(eng.def.pos.y) - 14, '#111', 'rgba(140,230,140,.9)');
    }
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
    for (const o of sim.offense) {
      const A = o.assignment;
      if (A?.type !== 'RUN_BLOCK' || !A.target || o.engagedWith) continue;
      if (A.tech === 'CLIMB' || A.tech === 'PULL') {
        ctx.strokeStyle = A.tech === 'PULL' ? 'rgba(255,170,60,.85)' : 'rgba(150,220,255,.85)';
        ctx.beginPath(); ctx.moveTo(sx(o.pos.x), sy(o.pos.y)); ctx.lineTo(sx(A.target.pos.x), sy(A.target.pos.y)); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // Run game: RB lanes (score-colored), chosen lane, free defenders, RB decision / move.
    const rd = sim.runDebug;
    if (rd && sim.carrier === sim.off?.RB && sim.off.RB.run?.phase !== 'OPEN') {
      for (const l of rd.lanes) {
        const q = Math.max(-1, Math.min(1, l.score / 3));
        ctx.fillStyle = q > 0 ? `rgba(${Math.round(220 - 180 * q)},230,90,.85)` : `rgba(240,${Math.round(200 + 160 * q)},70,.85)`;
        ctx.beginPath(); ctx.arc(sx(l.x), sy(l.y), Math.max(3, 0.35 * s), 0, Math.PI * 2); ctx.fill();
        label(`${l.type[0]} ${l.score.toFixed(1)}`, sx(l.x) + 0.9 * s + 14, sy(l.y), '#fff', 'rgba(0,0,0,.55)');
      }
      if (rd.chosen) {
        ctx.strokeStyle = '#f6c453'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx(rd.chosen.x), sy(rd.chosen.y), Math.max(7, 0.7 * s), 0, Math.PI * 2); ctx.stroke();
      }
    }
    if (rd) for (const d of sim.defense) {
      if (!rd.free.includes(d.id) || d.down) continue;
      const sc = screen.get(d); if (!sc) continue;
      ctx.strokeStyle = 'rgba(255,60,60,.95)'; ctx.lineWidth = 2; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(sc.X, sc.Y, sc.r + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      label('FREE', sc.X, sc.Y - sc.r - 12, '#fff', 'rgba(200,30,30,.85)');
    }
    const car = sim.carrier;
    if (car) {
      const sc = screen.get(car);
      const mv = car.moveState?.cur?.type;
      const txt = [car.run && car.run.phase !== 'OPEN' ? car.run.decision : null, mv].filter(Boolean).join(' · ');
      if (sc && txt) label(txt, sc.X, sc.Y - sc.r - 24, '#111', '#f6c453');
    }
    // QB reads
    const qs = sim.qbState;
    if (qs && qs.reads?.length) {
      qs.reads.forEach((r, i) => {
        const sc = screen.get(r); if (!sc) return;
        const cur = i === Math.min(qs.readIdx, qs.reads.length - 1) && sim.phase === 'PRE_THROW';
        label(String(i + 1), sc.X + sc.r + 6, sc.Y - sc.r - 4, cur ? '#111' : '#fff', cur ? '#f6c453' : 'rgba(30,60,140,.85)');
      });
    }
    // ball trajectory: aim point + intended point
    const b = sim.ball;
    if (b) {
      ctx.strokeStyle = 'rgba(246,196,83,.8)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(sx(b.from.x), sy(b.from.y)); ctx.lineTo(sx(b.aim.x), sy(b.aim.y)); ctx.stroke(); ctx.setLineDash([]);
      const X = sx(b.aim.x), Y = sy(b.aim.y);
      ctx.beginPath(); ctx.moveTo(X - 6, Y - 6); ctx.lineTo(X + 6, Y + 6); ctx.moveTo(X + 6, Y - 6); ctx.lineTo(X - 6, Y + 6); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(sx(b.intended.x), sy(b.intended.y), 5, 0, Math.PI * 2); ctx.stroke();
    }
    // assignment labels
    for (const e of sim.ents) {
      const sc = screen.get(e); if (!sc || !e.assignment) continue;
      label(e.assignment.label, sc.X, sc.Y + sc.r + 9, e.side === 'off' ? '#cfe3ff' : '#ffd0d0');
    }
    ctx.restore();
  }

  function render(sim, alpha, opts = {}) {
    W = hd.w; H = hd.h;
    hd.begin();
    if (opts.zoom) cam.zoom = opts.zoom;
    prefs = { photos: opts.photos !== false, visual: opts.visual || (opts.photos === false ? 'plain' : 'photo'), follow: opts.follow !== false, selected: opts.selected || null };
    lastSim = sim;
    teamCols = sideColors(opts.teams?.off, opts.teams?.def);
    updateCamera(sim, alpha);
    drawField(sim, opts.teams || {});
    screen = new Map();
    const holder = sim.carrier;
    for (const e of [...sim.ents].sort((a, b) => (a.down ? 0 : 1) - (b.down ? 0 : 1))) screen.set(e, drawPlayer(e, alpha, e === holder));
    if (opts.debug) drawDebug(sim, alpha, screen);
    drawBall(sim, alpha);
  }

  // Hit test in CSS pixels (canvas-relative) → entity under the cursor (last rendered frame).
  function pick(px, py) {
    let best = null, bd = Infinity;
    for (const [e, sc] of screen) { const d = Math.hypot(sc.X - px, sc.Y - py); if (d < Math.max(10, sc.r + 4) && d < bd) { bd = d; best = e; } }
    return best;
  }

  return { render, resize, pick, get colors() { return teamCols; }, camera: cam, dispose: () => hd.dispose(), get size() { return { w: hd.w, h: hd.h, dpr: hd.dpr }; } };
}

function hexA(hex, a) { const h = (hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const lastName = n => { const w = String(n || '').trim().split(/\s+/); while (w.length > 1 && SUFFIX.test(w[w.length - 1])) w.pop(); return w[w.length - 1] || ''; };
// Offense/defense colors; when both teams' primaries are too close, the defense switches to white jerseys.
function sideColors(off, def) {
  const o = TEAM_COLORS[off] || '#1d4ed8', d = TEAM_COLORS[def] || '#b91c1c';
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [a, b] = [rgb(o), rgb(d)];
  const close = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 90;
  return { off: [o, '#ffffff'], def: close ? ['#f2f4f7', d] : [d, '#ffffff'] };
}
