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
// Camera presets (on top of the classic zoom + follow): BROADCAST (wide lens, leads the ball), TACTICAL (whole
// formation, fixed on the line of scrimmage), QB (behind / over the QB, looking downfield), ENDZONE (looking down
// the field from the offense's end zone). QB and ENDZONE rotate the world 90 degrees; sprites and labels stay upright.
export const CAMERAS = {
  BROADCAST: { label: 'Broadcast', key: 'B' },
  TACTICAL: { label: 'Tática', key: 'T' },
  QB: { label: 'QB', key: 'Q' },
  ENDZONE: { label: 'Endzone', key: 'E' },
};
const ROT_UP = -Math.PI / 2; // world +x (downfield) drawn toward the top of the screen

export function createRenderer(canvas, { crowd = null } = {}) {
  // HiDPI: CSS size for layout/drawing math, backing store = CSS × devicePixelRatio (crisp on 1980px / 4K / Retina).
  const hd = attachHiDPI(canvas, { minW: 300, minH: 180 });
  const ctx = hd.ctx;
  const cam = { x: 35, y: FIELD_W / 2, zoom: 'medium', init: false, s: 10, rot: 0, preset: null };
  let W = hd.w, H = hd.h;
  let cs = 1, sn = 0;
  let screen = new Map(), prefs = { photos: true, visual: 'photo', follow: true, selected: null, highlights: true }, curSim = null;
  let teamCols = { off: ['#1d4ed8', '#ffffff'], def: ['#b91c1c', '#ffffff'] }, lastSim = null;

  function resize() { hd.measure(); W = hd.w; H = hd.h; }

  const ppy = () => cam.s;
  // World (yards) -> screen (CSS px), through the camera center, scale and rotation.
  function pt(x, y) {
    const dx = (x - cam.x) * cam.s, dy = (y - cam.y) * cam.s;
    return [W / 2 + dx * cs - dy * sn, H / 2 + dx * sn + dy * cs];
  }
  const sx = x => pt(x, cam.y)[0], sy = y => pt(cam.x, y)[1]; // legacy helpers (axis-aligned use only: stands)
  function polyW(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => { const [X, Y] = pt(x, y); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath(); }
  function fillW(x0, y0, x1, y1, style) { ctx.fillStyle = style; polyW([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); ctx.fill(); }
  function strokeW(x0, y0, x1, y1) { polyW([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); ctx.stroke(); }
  function lineW(x0, y0, x1, y1) { const a = pt(x0, y0), b = pt(x1, y1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function textW(txt, x, y, extra = 0) { const [X, Y] = pt(x, y); ctx.save(); ctx.translate(X, Y); ctx.rotate(cam.rot + extra); ctx.fillText(txt, 0, 0); ctx.restore(); }
  function dotW(x, y, rYd, fill, stroke = null, minPx = 1.5) { const [X, Y] = pt(x, y); ctx.beginPath(); ctx.arc(X, Y, Math.max(minPx, rYd * cam.s), 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); } }

  // Camera target for the current frame: center (x, y), scale (px per yard) and rotation.
  function cameraTarget(sim) {
    const preset = prefs.camera;
    const ballFocus = sim.ball ? sim.ball.pos : sim.carrier ? sim.carrier.pos : null;
    if (preset === 'BROADCAST') {
      const s = W / 50;
      // lead the ball downfield, but keep the passer in frame while the ball is in the air
      const air = sim.ball && !sim.carrier;
      const fx = ballFocus ? (air ? 0.65 * ballFocus.x + 0.35 * sim.qb.pos.x + 2 : ballFocus.x + 4) : sim.losX + 8;
      const fy = ballFocus ? 0.55 * ballFocus.y + 0.45 * (FIELD_W / 2) : FIELD_W / 2;
      return { s, rot: 0, x: fx, y: fy };
    }
    if (preset === 'TACTICAL') {
      const s = Math.min(W / 46, H / (FIELD_W + 7));
      const far = ballFocus && ballFocus.x > sim.losX + 17;
      return { s, rot: 0, x: far ? ballFocus.x - 6 : sim.losX + 6, y: FIELD_W / 2 };
    }
    if (preset === 'QB') {
      const s = W / 24, along = H / s;
      const f = sim.ball && !sim.carrier ? sim.ball.pos : (sim.carrier || sim.qb).pos;
      return { s, rot: ROT_UP, x: f.x + along * 0.22, y: f.y };
    }
    if (preset === 'ENDZONE') {
      const s = Math.min(W / (FIELD_W + 9), H / 36);
      const f = ballFocus || { x: sim.losX, y: FIELD_W / 2 };
      return { s, rot: ROT_UP, x: Math.max(sim.losX, f.x) + 9, y: FIELD_W / 2 + (f.y - FIELD_W / 2) * 0.25 };
    }
    // classic: zoom close/mid/full + follow
    const s = cam.zoom === 'full' && crowd ? Math.min(W / ZOOMS.full, H / (FIELD_W + 32)) : W / ZOOMS[cam.zoom]; // full: show a few rows of stands
    const viewW = W / s, viewH = H / s;
    let fx = sim.losX + 6, fy = FIELD_W / 2;
    const focus = !prefs.follow ? null : ballFocus;
    if (focus) { fx = focus.x; fy = 0.6 * focus.y + 0.4 * (FIELD_W / 2); }
    if (cam.zoom === 'full') { fx = FIELD_LEN / 2; fy = FIELD_W / 2; }
    const clampX = v => viewW >= FIELD_LEN + 6 ? FIELD_LEN / 2 : Math.min(FIELD_LEN + 3 - viewW / 2, Math.max(viewW / 2 - 3, v));
    const my = crowd ? (cam.zoom === 'full' ? 18 : 13) : 8; // with stands, the camera may show a few rows beyond the team areas
    const clampY = v => viewH >= FIELD_W + 2 * my ? FIELD_W / 2 : Math.min(FIELD_W + my - viewH / 2, Math.max(viewH / 2 - my, v));
    return { s, rot: 0, x: clampX(fx), y: clampY(fy) };
  }

  function updateCamera(sim, alpha) {
    let t = cameraTarget(sim);
    if (![t.x, t.y, t.s, t.rot].every(Number.isFinite)) t = { x: sim.losX, y: FIELD_W / 2, s: W / ZOOMS.medium, rot: 0 }; // never poison the camera
    if (!cam.init) { cam.x = t.x; cam.y = t.y; cam.s = t.s; cam.rot = t.rot; cam.init = true; }
    const k = Math.min(1, 0.12 * alpha + 0.04);
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
    const k2 = Math.min(1, 0.1 + 0.1 * alpha); // lens / orientation changes glide
    cam.s += (t.s - cam.s) * k2;
    cam.rot += (t.rot - cam.rot) * k2;
    if (Math.abs(cam.rot - t.rot) < 0.002) cam.rot = t.rot;
    cs = Math.cos(cam.rot); sn = Math.sin(cam.rot);
  }

  function drawField(sim, teams) {
    const s = ppy();
    const col = abbr => TEAM_COLORS[abbr] || '#24364d';
    const upright = Math.abs(cam.rot) < 0.01;
    // surroundings: team areas (between the 32-yard lines), white 2-yd border
    ctx.fillStyle = '#123f24'; ctx.fillRect(0, 0, W, H);
    if (crowd) {
      fillW(-80, -80, 200, -8.2, '#0b1219'); fillW(-80, FIELD_W + 8.2, 200, FIELD_W + 80, '#0b1219');
      if (upright) crowd.draw(ctx, { cam: { sx, sy, scale: s }, t: performance.now() / 1000, view: { w: W, h: H } });
    }
    fillW(-2, -2, FIELD_LEN + 2, FIELD_W + 2, '#f2f5f8');
    drawSidelines(sim, teams, s, col);
    // playing field with 5-yard mowing stripes
    fillW(0, 0, FIELD_LEN, FIELD_W, '#1b5e35');
    for (let x = 10; x < 110; x += 5) if ((x / 5) % 2) fillW(x, 0, x + 5, FIELD_W, '#1f6a3c');
    // end zones in team colors (offense defends the left one, attacks the right one)
    const ez = (x0, abbr) => {
      fillW(x0, 0, x0 + 10, FIELD_W, col(abbr)); fillW(x0, 0, x0 + 10, FIELD_W, 'rgba(0,0,0,.18)');
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = `900 ${Math.max(10, s * 4.2)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      textW(abbr || '', x0 + 5, FIELD_W / 2, x0 < 60 ? -Math.PI / 2 : Math.PI / 2);
    };
    ez(0, teams.off); ez(110, teams.def);
    // yard lines, hash marks (NFL hashes 70'9" from each sideline), sideline ticks
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, s * 0.11);
    for (let x = 10; x <= 110; x += 5) lineW(x, 0, x, FIELD_W);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = Math.max(1, s * 0.08);
    for (let x = 11; x < 110; x++) {
      if (x % 5 === 0) continue;
      for (const hy of [0.35, 23.58, 29.75, FIELD_W - 0.35]) lineW(x, hy - 0.35, x, hy + 0.35);
    }
    // goal lines (thicker) and the 2-pt try line
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, s * 0.22);
    for (const x of [10, 110]) lineW(x, 0, x, FIELD_W);
    for (const x of [12, 108]) lineW(x, FIELD_W / 2 - 0.5, x, FIELD_W / 2 + 0.5);
    // yard numbers (with direction arrows toward the nearest goal line)
    if (s > 5) {
      ctx.fillStyle = 'rgba(255,255,255,.78)'; ctx.font = `800 ${Math.max(10, s * 2)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let x = 20; x <= 100; x += 10) {
        const n = x <= 60 ? x - 10 : 110 - x;
        for (const [yy, rot] of [[FIELD_W - 10.5, 0], [10.5, Math.PI]]) {
          textW(String(n), x, yy, rot);
          if (n !== 50) {
            const dir = x < 60 ? -1 : 1, ax = dir * 2.6;
            const A = pt(x + ax + dir * 0.7, yy), B = pt(x + ax, yy - 0.45), C = pt(x + ax, yy + 0.45);
            ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.fill();
          }
        }
      }
    }
    // midfield mark (home team)
    if (teams.home && s > 3) {
      dotW(60, FIELD_W / 2, 5, hexA(col(teams.home), 0.55));
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = `900 ${Math.max(10, s * 2.6)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      textW(teams.home, 60, FIELD_W / 2);
    }
    // pylons (8) and goalposts on the end lines (top-down: post + 18'6" crossbar)
    ctx.fillStyle = '#ff7a1a';
    for (const x of [0, 10, 110, 120]) for (const y of [0, FIELD_W]) { const w = Math.max(3, s * 0.45); const [X, Y] = pt(x, y); ctx.fillRect(X - w / 2, Y - w / 2, w, w); }
    ctx.strokeStyle = '#f5d33a'; ctx.lineWidth = Math.max(2, s * 0.22);
    for (const [x, d] of [[0, -1], [120, 1]]) { lineW(x + d * 0.6, FIELD_W / 2 - 3.08, x + d * 0.6, FIELD_W / 2 + 3.08); lineW(x + d * 0.6, FIELD_W / 2, x + d * 1.6, FIELD_W / 2); }
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = Math.max(1.5, s * 0.12); strokeW(0, 0, FIELD_LEN, FIELD_W);
    // line of scrimmage (blue) and line to gain (yellow) + sideline down markers (chains)
    const gain = Math.min(110, sim.losX + sim.distance);
    ctx.lineWidth = Math.max(2, s * 0.2);
    ctx.strokeStyle = '#4ea1ff'; lineW(sim.losX, 0, sim.losX, FIELD_W);
    if (gain < 110) { ctx.strokeStyle = '#f6c453'; lineW(gain, 0, gain, FIELD_W); }
    drawChainCrew(sim, s, gain);
  }

  // Chain crew: down marker + two chain men holding the poles at the line of scrimmage and the line to gain,
  // with the chain between them (sideline, outside the white border).
  function drawChainCrew(sim, s, gain) {
    const yPole = FIELD_W + 1.15, yMan = FIELD_W + 1.95;
    const pole = (x, txt, bg, big) => {
      ctx.strokeStyle = '#dfe6ee'; ctx.lineWidth = Math.max(1, s * 0.09); lineW(x, FIELD_W + 0.2, x, yPole);
      const w = Math.max(14, s * 1.6), h = Math.max(12, s * 1.2), [X, Y] = pt(x, yPole);
      ctx.fillStyle = bg; ctx.fillRect(X - w / 2, Y - h / 2, w, h);
      ctx.fillStyle = '#111'; ctx.font = `900 ${Math.max(9, h * 0.75)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, X, Y + 0.5);
      if (s > 3.5) { dotW(x, yMan, 0.42, '#f4f1e8', 'rgba(0,0,0,.55)', 2.4); dotW(x, yMan, 0.2, big ? '#ff8a1a' : '#8a8f98', null, 1); } // chain man: white shirt, orange/grey vest
    };
    if (gain < 110) {
      ctx.strokeStyle = 'rgba(255,138,26,.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); lineW(sim.losX, yPole, gain, yPole); ctx.setLineDash([]);
      pole(gain, '▮', '#ff8a1a', false);
    }
    pole(sim.losX, String(sim.down || ''), '#ff8a1a', true);
    // second chain man beside the down marker (the box man holds the other pole)
    if (s > 3.5) dotW(sim.losX + 1.3, yMan, 0.42, '#f4f1e8', 'rgba(0,0,0,.55)', 2.4);
  }

  // Team areas (benches), coaches and reserves along both sidelines in team colors. HOME is the high-y side
  // (y = field width, bottom of the standard view) and AWAY the opposite one (y = 0); both are tagged CASA / VISIT. and striped on the white border.
  function drawSidelines(sim, teams, s, col) {
    const t = performance.now() / 1000;
    const side = (abbr, home) => {
      const sgn = home ? 1 : -1, y0 = home ? FIELD_W + 3 : -7.5, y1 = y0 + 4.5, base = col(abbr);
      // border stripe in team color on the sideline
      fillW(0, home ? FIELD_W : -0.7, FIELD_LEN, home ? FIELD_W + 0.7 : 0, hexA(base, 0.85));
      // area
      fillW(42, y0, 78, y1, hexA(base, 0.55));
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; strokeW(42, y0, 78, y1);
      if (s > 3.2) {
        // bench: long seat along the field edge of the area, then standing reserves
        const yb = home ? y0 + 0.5 : y1 - 1.1;
        fillW(44, yb, 76, yb + 0.6, 'rgba(15,20,28,.75)');
        const second = hexA('#ffffff', 0.9);
        for (let i = 0; i < 12; i++) {
          const x = 45 + i * 2.6, sway = Math.sin(t * 1.3 + i * 1.7) * 0.06;
          dotW(x, yb + 0.3 + sway, 0.4, base, 'rgba(255,255,255,.9)', 2.2);   // reserve in team color (white rim)
          dotW(x, yb + 0.3 + sway, 0.16, second, null, 0.8);                   // number plate
        }
        // coaches stand at the sideline near the line of scrimmage: headset (small ring) + team color polo
        const cx = Math.max(30, Math.min(90, sim.losX));
        const yc = home ? FIELD_W + 1.9 : -1.9;
        for (let i = 0; i < 3; i++) {
          const x = cx + (i - 1) * 1.7 + Math.sin(t * 0.9 + i) * 0.08;
          dotW(x, yc, 0.5, '#f4f1e8', hexA(base, 1), 2.6);
          dotW(x, yc, 0.3, base, null, 1.3);
          dotW(x - 0.2, yc - 0.1 * sgn, 0.14, '#111', null, 0.8);               // headset
        }
      }
      if (s > 4) {
        ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = `800 ${Math.max(9, s * 1.5)}px Inter, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        textW(`${home ? 'CASA' : 'VISIT.'} · ${abbr || ''} TEAM AREA`, 60, home ? y1 - 0.9 : y0 + 0.9);
      }
    };
    if (teams.home) side(teams.home, true);
    if (teams.away) side(teams.away, false);
  }

  function lerpPos(e, a) { return { x: e.prev.x + (e.pos.x - e.prev.x) * a, y: e.prev.y + (e.pos.y - e.prev.y) * a }; }

  // Shared sprite grammar: far = team color + number · mid = photo + number (+ position) · close = photo + name.
  // QB gets a role outline, the ball carrier a gold ring; offense/defense use their real team colors.
  function drawPlayer(e, a, isCarrier) {
    const s = ppy();
    const p = lerpPos(e, a);
    const [X, Y] = pt(p.x, p.y);
    const level = s >= 17 ? 'close' : s >= 9 ? 'mid' : 'far';
    const av = prefs.visual === 'avatar';
    const r = (level === 'close' ? Math.min(22, s * 0.62) : level === 'mid' ? Math.max(9.5, s * 0.5) : Math.max(5, s * 0.55)) * (av ? 1.35 : 1);
    const off = e.side === 'off';
    const c = off ? teamCols.off : teamCols.def;
    const qb = e === lastSim?.qb;
    drawSprite(ctx, {
      x: X, y: Y, r, color: c[0], color2: c[1], number: e.jersey || '', pos: e.slot, name: level === 'close' ? lastName(e.name) : '',
      img: prefs.visual === 'photo' && level !== 'far' ? photoImage(e.p) : null,
      avatar: av ? { opts: getAvatar('nfl', e.p?.gsis_id || e.p?.full_name || e.id), kit: 'football', role: qb ? 'qb' : 'player', prop: isCarrier || qb ? 'ball' : 'none', pose: 'stand', moving: Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y) > 0.03, seed: (e.jersey || 0) % 9, dir: e.side === 'off' ? 1 : -1 } : null, shape: qb ? 'pitcher' : 'circle', facing: e.facing + cam.rot,
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
    const [BX, BY] = pt(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(BX, BY, Math.max(2, s * 0.22), Math.max(1.5, s * 0.14), 0, 0, Math.PI * 2); ctx.fill();
    const lift = z * s * 0.55;
    const size = Math.max(3, s * (0.22 + z * 0.02));
    ctx.fillStyle = '#8b4513'; ctx.strokeStyle = '#f1c27d'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(BX, BY - lift, size * 1.5, size, cam.rot, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
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
      ctx.moveTo(...pt(start.x, start.y));
      for (const p of r.route.pts) ctx.lineTo(...pt(p.x, p.y));
      ctx.stroke();
    }
    // man coverage links + zone landmarks
    for (const d of sim.defense) {
      const A = d.assignment; if (!A) continue;
      if (A.type === 'MAN' && A.target) {
        ctx.strokeStyle = 'rgba(255,120,120,.6)'; ctx.beginPath(); ctx.moveTo(...pt(d.pos.x, d.pos.y)); ctx.lineTo(...pt(A.target.pos.x, A.target.pos.y)); ctx.stroke();
      } else if (A.type === 'ZONE') {
        const z = A.zone;
        ctx.strokeStyle = z.deep ? 'rgba(120,180,255,.5)' : 'rgba(255,220,120,.5)';
        { const xa = sim.losX + (z.deep ? 10 : 1); strokeW(xa, z.y0, xa + (z.deep ? 14 : z.x - sim.losX + 5), z.y1); }
      }
    }
    ctx.setLineDash([]);
    // blocks: line colored by leverage (green = blocker winning, red = defender winning)
    for (const eng of sim.engagements) {
      const lev = Math.max(-1, Math.min(1, eng.lev));
      const col = lev > 0 ? `rgba(255,${Math.round(200 - 160 * lev)},60,.95)` : `rgba(${Math.round(200 + 55 * lev)},255,90,.95)`;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (const b of eng.blockers) { ctx.beginPath(); ctx.moveTo(...pt(b.pos.x, b.pos.y)); ctx.lineTo(...pt(eng.def.pos.x, eng.def.pos.y)); ctx.stroke(); }
    }
    // Run game: double teams (thick + "2x"), climbs off a double (dashed arrow to the backer).
    for (const eng of sim.engagements) {
      if (eng.blockers.length < 2) continue;
      { const [qx, qy] = pt(eng.def.pos.x, eng.def.pos.y); label(`2x ${eng.double?.phase || 'DOUBLE'}`, qx, qy - 14, '#111', 'rgba(140,230,140,.9)'); }
    }
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
    for (const o of sim.offense) {
      const A = o.assignment;
      if (A?.type !== 'RUN_BLOCK' || !A.target || o.engagedWith) continue;
      if (A.tech === 'CLIMB' || A.tech === 'PULL') {
        ctx.strokeStyle = A.tech === 'PULL' ? 'rgba(255,170,60,.85)' : 'rgba(150,220,255,.85)';
        ctx.beginPath(); ctx.moveTo(...pt(o.pos.x, o.pos.y)); ctx.lineTo(...pt(A.target.pos.x, A.target.pos.y)); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // Run game: RB lanes (score-colored), chosen lane, free defenders, RB decision / move.
    const rd = sim.runDebug;
    if (rd && sim.carrier === sim.off?.RB && sim.off.RB.run?.phase !== 'OPEN') {
      for (const l of rd.lanes) {
        const q = Math.max(-1, Math.min(1, l.score / 3));
        ctx.fillStyle = q > 0 ? `rgba(${Math.round(220 - 180 * q)},230,90,.85)` : `rgba(240,${Math.round(200 + 160 * q)},70,.85)`;
        ctx.beginPath(); ctx.arc(...pt(l.x, l.y), Math.max(3, 0.35 * s), 0, Math.PI * 2); ctx.fill();
        { const [lx, ly] = pt(l.x, l.y); label(`${l.type[0]} ${l.score.toFixed(1)}`, lx + 0.9 * s + 14, ly, '#fff', 'rgba(0,0,0,.55)'); }
      }
      if (rd.chosen) {
        ctx.strokeStyle = '#f6c453'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(...pt(rd.chosen.x, rd.chosen.y), Math.max(7, 0.7 * s), 0, Math.PI * 2); ctx.stroke();
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
      ctx.beginPath(); ctx.moveTo(...pt(b.from.x, b.from.y)); ctx.lineTo(...pt(b.aim.x, b.aim.y)); ctx.stroke(); ctx.setLineDash([]);
      const [X, Y] = pt(b.aim.x, b.aim.y);
      ctx.beginPath(); ctx.moveTo(X - 6, Y - 6); ctx.lineTo(X + 6, Y + 6); ctx.moveTo(X + 6, Y - 6); ctx.lineTo(X - 6, Y + 6); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(...pt(b.intended.x, b.intended.y), 5, 0, Math.PI * 2); ctx.stroke();
    }
    // Pocket (measured from OL/DL positions): polygon linemen -> QB, tinted red as it collapses; rush moves; stunt link.
    const pk = qs?.pocket;
    if (pk && sim.call.type === 'pass' && !sim.carrier) {
      const ol = ['LT', 'LG', 'C', 'RG', 'RT'].map(k => sim.off[k]);
      ctx.fillStyle = `rgba(${Math.round(70 + 185 * pk.collapse)},${Math.round(200 - 150 * pk.collapse)},90,.16)`;
      ctx.beginPath(); ol.forEach((o, i) => { const [X, Y] = pt(o.pos.x, o.pos.y); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      { const [X, Y] = pt(sim.qb.pos.x, sim.qb.pos.y); ctx.lineTo(X, Y); } ctx.closePath(); ctx.fill();
      const [qx, qy] = pt(sim.qb.pos.x, sim.qb.pos.y);
      label(`bolsão ${Math.round(pk.collapse * 100)}%${pk.leak ? ' ' + pk.leak[0] + (pk.sector || '') : ''}${qs.action ? ' · ' + qs.action : ''}`, qx, qy + 20, '#fff', 'rgba(20,40,60,.8)');
    }
    for (const d of sim.defense) {
      const sc = screen.get(d); if (!sc || !d.rushAnim || d.down || d.rushAnim.phase === 'END') continue;
      if (d.eng || d.rushAnim.phase === 'WON') label(`${d.rushAnim.move}${d.rushAnim.phase === 'WON' ? ' ✓' : ''}`, sc.X, sc.Y - sc.r - 10, '#111', d.rushAnim.phase === 'WON' ? '#ff7a59' : '#ffd166');
    }
    if (sim.stunt) {
      ctx.setLineDash([6, 3]); ctx.strokeStyle = 'rgba(255,120,200,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(...pt(sim.stunt.pen.pos.x, sim.stunt.pen.pos.y)); ctx.lineTo(...pt(sim.stunt.loop.pos.x, sim.stunt.loop.pos.y)); ctx.stroke(); ctx.setLineDash([]);
      const sc = screen.get(sim.stunt.loop); if (sc) label(`STUNT ${sim.stunt.type} ${sim.stunt.phase}`, sc.X, sc.Y - sc.r - 22, '#111', '#ff9ad5');
    }
    // assignment labels
    for (const e of sim.ents) {
      const sc = screen.get(e); if (!sc || !e.assignment) continue;
      label(e.assignment.label, sc.X, sc.Y + sc.r + 9, e.side === 'off' ? '#cfe3ff' : '#ffd0d0');
    }
    ctx.restore();
  }

  // Discreet focus cues (no arcade look): QB = thin light ring, ball carrier = gold arrow above, intended target =
  // dashed cyan ring + small arrow, and the nearest defender to the carrier / target = thin orange ring with a short
  // tick pointing at the man he is closing on.
  function drawHighlights(sim, a, screen) {
    const s = ppy();
    const ring = (e, color, dash, pad = 4, w = 1.6) => {
      const sc = screen.get(e); if (!sc) return null;
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.arc(sc.X, sc.Y, sc.r + pad, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      return sc;
    };
    const arrow = (sc, color) => {
      const y = sc.Y - sc.r - 7;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(sc.X, y + 5); ctx.lineTo(sc.X - 4.5, y - 3); ctx.lineTo(sc.X + 4.5, y - 3); ctx.closePath(); ctx.fill();
    };
    const holder = sim.carrier;
    const qb = sim.qb;
    if (qb && !qb.down) ring(qb, 'rgba(150,205,255,.85)', [], 3, 1.4);
    // intended target: the ball's target once thrown, the QB's current look before that
    const tgt = sim.ball?.target || (sim.phase === 'PRE_THROW' && !holder ? sim.qbState?.lookingAt : null);
    if (tgt && tgt !== holder && !tgt.down) { const sc = ring(tgt, sim.ball ? 'rgba(80,225,235,.95)' : 'rgba(80,225,235,.5)', sim.ball ? [4, 3] : [2, 4], 4, 1.8); if (sc && sim.ball) arrow(sc, 'rgba(80,225,235,.95)'); }
    if (holder && !holder.down) { const sc = screen.get(holder); if (sc) arrow(sc, 'rgba(246,196,83,.95)'); }
    // nearest opponent of the ball carrier / target
    const focus = holder || tgt;
    if (focus) {
      let best = null, bd = 1e9;
      for (const d of sim.ents) {
        if (d.side === focus.side || d.down) continue;
        const dd = Math.hypot(d.pos.x - focus.pos.x, d.pos.y - focus.pos.y);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best && bd < 14) {
        const sc = ring(best, 'rgba(255,140,60,.9)', [3, 3], 4, 1.5), fs = screen.get(focus);
        if (sc && fs) {
          const dx = fs.X - sc.X, dy = fs.Y - sc.Y, l = Math.hypot(dx, dy) || 1, r0 = sc.r + 7;
          ctx.strokeStyle = 'rgba(255,140,60,.8)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(sc.X + dx / l * r0, sc.Y + dy / l * r0); ctx.lineTo(sc.X + dx / l * (r0 + Math.min(14, 0.7 * s + 4)), sc.Y + dy / l * (r0 + Math.min(14, 0.7 * s + 4))); ctx.stroke();
        }
      }
    }
  }

  function render(sim, alpha, opts = {}) {
    W = hd.w; H = hd.h;
    hd.begin();
    if (opts.zoom) cam.zoom = opts.zoom;
    prefs = { photos: opts.photos !== false, visual: opts.visual || (opts.photos === false ? 'plain' : 'photo'), follow: opts.follow !== false, selected: opts.selected || null, camera: CAMERAS[opts.camera] ? opts.camera : null, highlights: opts.highlights !== false };
    cam.preset = prefs.camera;
    lastSim = sim;
    teamCols = sideColors(opts.teams?.off, opts.teams?.def);
    updateCamera(sim, alpha);
    drawField(sim, opts.teams || {});
    screen = new Map();
    const holder = sim.carrier;
    for (const e of [...sim.ents].sort((a, b) => (a.down ? 0 : 1) - (b.down ? 0 : 1))) screen.set(e, drawPlayer(e, alpha, e === holder));
    if (prefs.highlights) drawHighlights(sim, alpha, screen);
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
