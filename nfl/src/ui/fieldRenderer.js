// Canvas renderer for the play simulation. Pure presentation: reads sim state, never changes it.
// Zoom levels: close = photo + number, medium = jersey + number, far = dot + number.
// Debug overlay: assignments, routes, QB reads, blocks (leverage), coverage, ball trajectory, run game
// (lanes + scores, chosen lane, RB decision/move, double teams, climbs/pulls, free defenders).
import { playerPhoto, fallbackDataUri } from '../dataService.js';
import { FIELD_LEN, FIELD_W } from '../sim/geometry.js';

// ---- PlayerPhotoResolver cache: one Image per URL, loaded once, safe fallback on error ----
const photoCache = new Map();
export function photoFor(p) {
  const url = playerPhoto(p) || fallbackDataUri(p.full_name);
  let rec = photoCache.get(url);
  if (!rec) {
    const img = new Image();
    rec = { img, ok: false, failed: false };
    img.onload = () => { rec.ok = true; };
    img.onerror = () => {
      if (!rec.failed) { rec.failed = true; img.src = fallbackDataUri(p.full_name); }
    };
    img.src = url;
    photoCache.set(url, rec);
  }
  return rec.ok ? rec.img : null;
}

export const ZOOMS = { close: 34, medium: 56, full: 120 }; // visible yards across

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 35, y: FIELD_W / 2, zoom: 'medium', init: false };
  let W = 0, H = 0, dpr = 1;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = Math.max(300, r.width); H = Math.max(180, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }

  function ppy() { return W / ZOOMS[cam.zoom]; }
  function sx(x) { return (x - cam.x) * ppy() + W / 2; }
  function sy(y) { return (y - cam.y) * ppy() + H / 2; }

  function updateCamera(sim, alpha) {
    const s = ppy();
    const viewW = W / s, viewH = H / s;
    let fx = sim.losX + 6, fy = FIELD_W / 2;
    const focus = sim.ball ? sim.ball.pos : sim.carrier ? sim.carrier.pos : null;
    if (focus) { fx = focus.x; fy = 0.6 * focus.y + 0.4 * (FIELD_W / 2); }
    if (cam.zoom === 'full') { fx = FIELD_LEN / 2; fy = FIELD_W / 2; }
    const clampX = v => viewW >= FIELD_LEN + 4 ? FIELD_LEN / 2 : Math.min(FIELD_LEN + 2 - viewW / 2, Math.max(viewW / 2 - 2, v));
    const clampY = v => viewH >= FIELD_W + 4 ? FIELD_W / 2 : Math.min(FIELD_W + 2 - viewH / 2, Math.max(viewH / 2 - 2, v));
    const tx = clampX(fx), ty = clampY(fy);
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    const k = Math.min(1, 0.12 * alpha + 0.04);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }

  function drawField(sim, teams) {
    const s = ppy();
    ctx.fillStyle = '#1b5e35'; ctx.fillRect(0, 0, W, H);
    // stripes every 5 yards
    for (let x = 10; x < 110; x += 5) {
      if ((x / 5) % 2) { ctx.fillStyle = '#1f6a3c'; ctx.fillRect(sx(x), sy(0), 5 * s, FIELD_W * s); }
    }
    // end zones
    ctx.fillStyle = '#16325f'; ctx.fillRect(sx(0), sy(0), 10 * s, FIELD_W * s);
    ctx.fillStyle = '#5c1620'; ctx.fillRect(sx(110), sy(0), 10 * s, FIELD_W * s);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `700 ${Math.max(10, s * 3)}px system-ui, sans-serif`; ctx.textAlign = 'center';
    const ez = (x, label) => { ctx.save(); ctx.translate(sx(x), sy(FIELD_W / 2)); ctx.rotate(-Math.PI / 2); ctx.fillText(label, 0, s); ctx.restore(); };
    ez(5, teams.off || ''); ez(115, teams.def || '');
    ctx.restore();
    // yard lines + numbers + hashes
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
    for (let x = 10; x <= 110; x += 5) { ctx.beginPath(); ctx.moveTo(sx(x), sy(0)); ctx.lineTo(sx(x), sy(FIELD_W)); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    for (let x = 11; x < 110; x++) {
      if (x % 5 === 0) continue;
      for (const hy of [0.4, 23.6, 29.7, FIELD_W - 0.4]) { ctx.beginPath(); ctx.moveTo(sx(x), sy(hy - 0.35)); ctx.lineTo(sx(x), sy(hy + 0.35)); ctx.stroke(); }
    }
    if (s > 5) {
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `700 ${Math.max(9, s * 1.6)}px system-ui, sans-serif`; ctx.textAlign = 'center';
      for (let x = 20; x <= 100; x += 10) { const n = x <= 60 ? x - 10 : 110 - x; ctx.fillText(String(n), sx(x), sy(9)); ctx.fillText(String(n), sx(x), sy(FIELD_W - 7.5)); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.strokeRect(sx(0), sy(0), FIELD_LEN * s, FIELD_W * s);
    // LOS and line to gain
    ctx.lineWidth = Math.max(2, s * 0.18);
    ctx.strokeStyle = '#4ea1ff'; ctx.beginPath(); ctx.moveTo(sx(sim.losX), sy(0)); ctx.lineTo(sx(sim.losX), sy(FIELD_W)); ctx.stroke();
    const gain = Math.min(110, sim.losX + sim.distance);
    ctx.strokeStyle = '#f6c453'; ctx.beginPath(); ctx.moveTo(sx(gain), sy(0)); ctx.lineTo(sx(gain), sy(FIELD_W)); ctx.stroke();
  }

  function lerpPos(e, a) { return { x: e.prev.x + (e.pos.x - e.prev.x) * a, y: e.prev.y + (e.pos.y - e.prev.y) * a }; }

  function drawPlayer(e, a, isCarrier) {
    const s = ppy();
    const p = lerpPos(e, a);
    const X = sx(p.x), Y = sy(p.y);
    const level = s >= 17 ? 'close' : s >= 9 ? 'medium' : 'far';
    const r = level === 'close' ? Math.min(22, s * 0.75) : level === 'medium' ? Math.max(7, s * 0.62) : Math.max(4, s * 0.55);
    const off = e.side === 'off';
    ctx.save();
    if (e.down) ctx.globalAlpha = 0.55;
    // facing tick
    ctx.strokeStyle = off ? '#cfe3ff' : '#ffb3b3'; ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(e.facing) * r * 1.45, Y + Math.sin(e.facing) * r * 1.45); ctx.stroke();
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fillStyle = off ? '#1d4ed8' : '#b91c1c'; ctx.fill();
    if (level === 'close') {
      const img = photoFor(e.p);
      if (img) { ctx.save(); ctx.beginPath(); ctx.arc(X, Y, r - 1.5, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(img, X - r, Y - r * 1.05, r * 2, r * 2 * (img.naturalHeight / img.naturalWidth || 1)); ctx.restore(); }
    }
    ctx.lineWidth = isCarrier ? 3 : 2; ctx.strokeStyle = isCarrier ? '#f6c453' : off ? '#e8eef5' : '#ff9a9a';
    ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.stroke();
    // jersey number
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (level === 'close') {
      ctx.font = `800 ${Math.max(9, r * 0.55)}px system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(X - r * 0.6, Y + r * 0.45, r * 1.2, r * 0.6);
      ctx.fillStyle = '#fff'; ctx.fillText(e.jersey || e.slot, X, Y + r * 0.76);
    } else {
      ctx.font = `800 ${Math.max(7, r * 0.95)}px system-ui, sans-serif`;
      ctx.fillText(e.jersey || '', X, Y + 0.5);
    }
    ctx.restore();
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
    if (!W) resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (opts.zoom) cam.zoom = opts.zoom;
    updateCamera(sim, alpha);
    drawField(sim, opts.teams || {});
    const screen = new Map();
    const holder = sim.carrier;
    for (const e of [...sim.ents].sort((a, b) => (a.down ? 0 : 1) - (b.down ? 0 : 1))) screen.set(e, drawPlayer(e, alpha, e === holder));
    if (opts.debug) drawDebug(sim, alpha, screen);
    drawBall(sim, alpha);
  }

  return { render, resize, camera: cam };
}
