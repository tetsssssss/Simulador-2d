// Etapa 7 (MLB): the hockey game in the 3D visual mode.   node tests/browser/mlb3d.mjs [port] [outDir]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, OUT = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1400, height: 800 } }); await ctx.addInitScript(() => { localStorage.setItem('asu_visual_mode', '3d'); });
const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|blocked by CORS/.test(m.text())) errs.push(m.text()); });
await page.goto(`http://localhost:${PORT}/#mlb`); await page.waitForTimeout(2500);
const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(() => { location.hash = '#diamond'; }).catch(() => {}); await page.waitForTimeout(2500);
await page.waitForTimeout(6000);
const info = () => f.evaluate(() => { const r = window.__asu3dRenderer; return r?.athletes && { ready: r.ready, n: r.athletes().length, clips: r.athletes().map(a => a.clip), cam: r.cameraState() }; });
let st = null; for (let i = 0; i < 20; i++) { st = await info(); if (st?.ready && st.n >= 10) break; await page.waitForTimeout(1500); }
check('3D MLB renderer ready with the fielders, batter and runners', !!st && st.ready && st.n >= 10, JSON.stringify(st && { n: st.n }));
const sim = await f.evaluate(() => { const r = window.__asu3dRenderer; return r.athletes().map(a => { const p = a.entity.getPosition(); return { wx: p.x, wz: p.z, sx: a.e.x * 0.3048, sy: -a.e.y * 0.3048 }; }); });
const worst = Math.max(...sim.map(a => Math.hypot(a.wx - a.sx, a.wz - a.sy)));
check('athletes within 1 m of the simulation positions (interpolation)', worst < 1, worst.toFixed(3) + ' m');
const clips = new Set(); for (let i = 0; i < 25; i++) { await page.waitForTimeout(500); (await info())?.clips.forEach(c => clips.add(c)); }
check('animation clips play (stance / ready / run / pitch …)', clips.size >= 2, [...clips].join(','));
const seats = await f.evaluate(() => window.__asu3dRenderer.crowdSeats());
check('crowd stands built (thousands of seats, 2 meshes)', seats > 2000, seats + ' seats');
if (OUT) await page.screenshot({ path: `${OUT}/mlb3d.png` });
check('no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
