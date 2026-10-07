// NHL Partida 2D — Alpha 0.1 rink prototype ported as-is (PLACEHOLDER: decorative skating + bouncing puck,
// no possession/goalie/physics). Fix vs Alpha: the rAF loop is cancelled on teardown (the old one leaked a loop
// per visit). The real HockeySimulationEngine and the big rink come in later sessions.
import { hash } from './nhlData.js';

const rnd = (seed, min, max) => min + (hash(seed) % (max - min + 1));

export function mountRink(root) {
  root.innerHTML = `<div class="panel"><div class="panel-h"><b>Rink 2D · protótipo</b><span class="muted small">placeholder visual — o motor NHL ainda não existe</span></div>
    <div class="nhl-rink-wrap"><canvas id="rink" width="1000" height="500"></canvas></div>
    <div class="toolbar" style="margin-top:10px"><button id="rkPlay" class="primary">Play</button><button id="rkPause">Pause</button><button id="rkReset">Reset</button></div></div>`;
  const c = root.querySelector('#rink'), x = c.getContext('2d');
  let running = true, raf = 0, players = [], puck;
  function reset() {
    players = [];
    for (let t = 0; t < 2; t++) for (let i = 0; i < 6; i++) players.push({ team: t, x: t ? 680 + rnd('b' + i, 0, 120) : 200 + rnd('a' + i, 0, 120), y: 70 + i * 65, vx: 0, vy: 0 });
    puck = { x: 500, y: 250, vx: 2.2, vy: 1.1 };
  }
  function draw() {
    if (!c.isConnected) { cancelAnimationFrame(raf); return; }
    x.clearRect(0, 0, c.width, c.height); x.fillStyle = '#eaf7ff'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#dd334d'; x.lineWidth = 4; x.beginPath(); x.moveTo(500, 0); x.lineTo(500, 500); x.stroke();
    x.strokeStyle = '#2877c7'; [300, 700].forEach(xx => { x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx, 500); x.stroke(); });
    x.strokeStyle = '#cc3045'; x.lineWidth = 3; [[500, 250], [180, 250], [820, 250]].forEach(([cx, cy]) => { x.beginPath(); x.arc(cx, cy, 58, 0, Math.PI * 2); x.stroke(); });
    if (running) { puck.x += puck.vx; puck.y += puck.vy; if (puck.x < 35 || puck.x > 965) puck.vx *= -1; if (puck.y < 25 || puck.y > 475) puck.vy *= -1; }
    players.forEach((p, i) => {
      if (running) { const chase = i % 3 === 0; const tx = chase ? puck.x : (p.team ? 690 : 310) + (i % 3) * 14, ty = 80 + (i % 6) * 65; const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1; p.vx = p.vx * 0.88 + dx / d * 0.35; p.vy = p.vy * 0.88 + dy / d * 0.35; p.x += p.vx; p.y += p.vy; }
      x.fillStyle = p.team ? '#d52a45' : '#2369bd'; x.beginPath(); x.arc(p.x, p.y, 14, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#fff'; x.font = '10px Arial'; x.textAlign = 'center'; x.fillText(i % 6 === 5 ? 'G' : String((i % 6) + 1), p.x, p.y + 3);
    });
    x.fillStyle = '#111'; x.beginPath(); x.arc(puck.x, puck.y, 7, 0, Math.PI * 2); x.fill();
    raf = requestAnimationFrame(draw);
  }
  reset(); raf = requestAnimationFrame(draw);
  root.querySelector('#rkPlay').onclick = () => { running = true; };
  root.querySelector('#rkPause').onclick = () => { running = false; };
  root.querySelector('#rkReset').onclick = reset;
  window.__nhlRinkLoops = (window.__nhlRinkLoops || 0) + 1; // test hook: count mounts
  return () => cancelAnimationFrame(raf);
}
