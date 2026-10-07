// MLB Partida 2D — Alpha 0.1 "Diamond 2D" ported as-is (PLACEHOLDER: no pitch/contact/fielding logic).
// Fixes vs Alpha: rAF loop is cancelled on teardown (the old one leaked a loop per visit) and "Rebater" uses a
// seeded RNG instead of Math.random. The real field/engine come in later sessions.
import { hash } from './mlbData.js';

function seeded(seed) { let a = hash(seed); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function mountDiamond(root) {
  root.innerHTML = `<div class="panel"><div class="panel-h"><b>Diamond 2D · protótipo</b><span class="muted small">placeholder visual — o motor MLB ainda não existe</span></div>
    <div class="mlb-field-wrap"><canvas id="field" width="1000" height="625"></canvas></div>
    <div class="toolbar" style="margin-top:10px"><button id="dmPitch" class="primary">Arremessar</button><button id="dmHit">Rebater</button><button id="dmReset">Reset</button></div></div>`;
  const c = root.querySelector('#field'), x = c.getContext('2d');
  const rng = seeded('diamond-prototype');
  let ball = { x: 500, y: 408, vx: 0, vy: 0, active: false }, raf = 0;
  const defenders = [[500, 390], [500, 300], [420, 300], [580, 300], [500, 210], [300, 150], [500, 110], [700, 150], [500, 470]];
  function draw() {
    if (!c.isConnected) { cancelAnimationFrame(raf); return; }
    x.clearRect(0, 0, c.width, c.height); x.fillStyle = '#287b44'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#c99d62'; x.beginPath(); x.moveTo(500, 510); x.lineTo(280, 300); x.lineTo(500, 90); x.lineTo(720, 300); x.closePath(); x.fill();
    x.fillStyle = '#fff'; [[500, 500], [610, 390], [500, 280], [390, 390]].forEach(([a, b]) => x.fillRect(a - 10, b - 10, 20, 20));
    defenders.forEach((p, i) => { x.fillStyle = i === 8 ? '#a71f2b' : '#173f79'; x.beginPath(); x.arc(p[0], p[1], 13, 0, Math.PI * 2); x.fill(); });
    if (ball.active) { ball.x += ball.vx; ball.y += ball.vy; ball.vx *= 0.995; ball.vy *= 0.995; if (ball.x < 10 || ball.x > 990 || ball.y < 10 || ball.y > 615) ball.active = false; }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(ball.x, ball.y, 7, 0, Math.PI * 2); x.fill();
    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);
  root.querySelector('#dmPitch').onclick = () => { ball = { x: 500, y: 300, vx: 0, vy: 5.5, active: true }; };
  root.querySelector('#dmHit').onclick = () => { ball = { x: 500, y: 470, vx: (rng() - 0.5) * 7, vy: -7 - rng() * 5, active: true }; };
  root.querySelector('#dmReset').onclick = () => { ball = { x: 500, y: 408, vx: 0, vy: 0, active: false }; };
  return () => cancelAnimationFrame(raf);
}
