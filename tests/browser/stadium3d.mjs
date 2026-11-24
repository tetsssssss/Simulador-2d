// Etapa 6 (lote 1): stadium, crowd and day/dusk/night looks in the 3D NFL mode.   node tests/browser/stadium3d.mjs [port] [outDir]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, OUT = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const ctx = await b.newContext({ viewport: { width: 1400, height: 800 } }); await ctx.addInitScript(() => { localStorage.setItem('asu_visual_mode', '3d'); localStorage.setItem('asu_nfl_director', '0'); localStorage.removeItem('asu_3d_look'); });
const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|blocked by CORS|github\.com\/nflverse/.test(m.text())) errs.push(m.text()); });
await page.goto(`http://localhost:${PORT}/#nfl`); await page.waitForTimeout(2500);
const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(() => { location.hash = '#play'; }); await page.waitForTimeout(1500);
await f.fill('#seedIn', 'STAD').catch(() => {}); await f.click('text=Iniciar Quick Game'); await page.waitForTimeout(5000);
const info = () => f.evaluate(() => ({ s: window.__asu3dRenderer?.stadiumInfo(), look: window.__asu3dRenderer?.look }));
let i0 = await info(); check('stadium built with thousands of crowd seats, day look, floodlights off', i0.s?.seats > 3000 && i0.look === 'day' && i0.s.floods === 0, JSON.stringify(i0));
await f.click('#camSeg button[data-camera="ENDZONE"]'); await page.waitForTimeout(6000);
for (const n of ['day', 'dusk', 'night']) { await f.evaluate(n => window.__asu3dRenderer.setLook(n), n); await page.waitForTimeout(2500); if (OUT) await page.screenshot({ path: `${OUT}/look_${n}.png` }); }
check('video board shows the score / quarter / clock of the game', /\|Q?1\|/.test(i0.s?.board || '') || /^[A-Z]+\|[A-Z]+\|0\|0\|1\|/.test((await info()).s?.board || ''), (await info()).s?.board);
await f.evaluate(() => window.__asu3dRenderer.setLook('auto')); await page.waitForTimeout(1500);
check('auto look in quarter 1 resolves to the day look', (await f.evaluate(() => window.__asu3dRenderer.shownLook)) === 'day');
await f.evaluate(() => window.__asu3dRenderer.setLook('night')); await f.click('#camSeg button[data-camera="BROADCAST"]'); await page.waitForTimeout(6000); if (OUT) await page.screenshot({ path: `${OUT}/board_night.png` });
const i1 = await info(); check('night look switches the four floodlights on', i1.look === 'night' && i1.s.floods === 4, JSON.stringify(i1));
check('invalid look refused', (await f.evaluate(() => window.__asu3dRenderer.setLook('nope'))) === false);
check('no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
