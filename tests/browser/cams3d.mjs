// Etapa 5 browser test: camera presets, director and instant replay in the 3D NFL mode.
//   python3 -m http.server 8300 &  node tests/browser/cams3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1500, height: 850 } }); await ctx.addInitScript(() => { localStorage.setItem('asu_visual_mode', '3d'); localStorage.setItem('asu_nfl_director', '0'); });
const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|blocked by CORS|github\.com\/nflverse/.test(m.text())) errs.push(m.text()); });
await page.goto(`http://localhost:${PORT}/#nfl`); await page.waitForTimeout(2500);
const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(() => { location.hash = '#play'; }); await page.waitForTimeout(1500);
await f.fill('#seedIn', 'CAM3D').catch(() => {}); await f.click('text=Iniciar Quick Game'); await page.waitForTimeout(3500);
const cam = () => f.evaluate(() => window.__asu3dRenderer?.cameraState());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
await f.waitForFunction(() => window.__asu3dRenderer?.cameraState?.(), null, { timeout: 25000 }).catch(() => {}); await page.waitForTimeout(500); check('3D renderer ready with a camera', !!(await cam()));
const seen = {};
for (const k of ['TACTICAL', 'QB', 'ENDZONE', 'BROADCAST']) {
  await f.click(`#camSeg button[data-camera="${k}"]`); let prev = null; for (let j = 0; j < 14; j++) { await page.waitForTimeout(500); seen[k] = await cam(); if (prev && dist(prev, seen[k].pos) < 0.05) break; prev = seen[k].pos; }
}
check('each preset puts the camera somewhere different (tactical is the highest, QB the lowest)', seen.TACTICAL.pos[1] > 40 && seen.QB.pos[1] < 6 && dist(seen.ENDZONE.pos, seen.BROADCAST.pos) > 10 && dist(seen.TACTICAL.pos, seen.QB.pos) > 20, Object.entries(seen).map(([k, v]) => k + ':y=' + v.pos[1].toFixed(1)).join(' '));
check('camera moves smoothly (no teleport) when switching preset', await (async () => { await f.click('#camSeg button[data-camera="TACTICAL"]'); await page.waitForTimeout(60); const a = await cam(); return dist(a.pos, seen.BROADCAST.pos) < dist(seen.TACTICAL.pos, seen.BROADCAST.pos) * 0.9; })());
// director on + automatic play: it must change shots by itself
await f.click('#dirBtn'); await f.click('button[data-speed="4"]').catch(() => {}); await f.evaluate(() => { const x = document.querySelector('#autoBtn'); if (x && !x.classList.contains('on')) x.click(); });
const shots = new Set(); let replayed = false, replayShot = null;
for (let i = 0; i < 160 && !(shots.size >= 2 && replayed); i++) {
  await page.waitForTimeout(250);
  const st = await f.evaluate(() => ({ on: document.querySelector('#camSeg button.on')?.dataset.camera, rep: window.__asu3dRenderer?.cameraState()?.replaying }));
  if (st.on) shots.add(st.on); if (st.rep && !replayed) { replayed = true; replayShot = st.on; }
  if (i === 70 && !replayed) await f.click('#instReplayBtn').catch(() => {});      // not seen a TD/turnover yet: ask for the replay
}
check('director changes shots on its own during play', shots.size >= 2, [...shots].join(','));
check('instant replay runs in 3D (renderer enters replay mode) with the director picking a replay shot', replayed && !!replayShot, String(replayShot));
await f.evaluate(() => document.querySelector('#instReplayBtn')?.click()); await page.waitForTimeout(800);
check('replay ends cleanly and the 3D view returns to live play', (await cam())?.replaying === false);
check('no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
