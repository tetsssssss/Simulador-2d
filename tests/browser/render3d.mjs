// Browser test of the 3D (PlayCanvas) visual mode, Etapa 1: mount / unmount cycles, no leaks or errors, 2D restored, all three sports.
//   python3 -m http.server 8300 &  node tests/browser/render3d.mjs [port] [outDir]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, OUT = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--enable-precise-memory-info', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1500, height: 850 } }); const errs = [], warns = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|blocked by CORS policy|github\.com\/nflverse/.test(t)) errs.push(t); if (/too many active webgl|context lost/i.test(t)) warns.push(t); });
let pass = 0, fail = 0; const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const frame = () => page.frames().find(x => x !== page.mainFrame());
const heap = () => frame().evaluate(() => performance.memory.usedJSHeapSize / 1048576);
await page.goto(`http://localhost:${PORT}/#nfl`); await page.waitForTimeout(2500);
for (const [sport, route, canvasSel, start] of [['nfl', '#play', '#fieldCanvas', true], ['nhl', '#rink', '#rinkCanvas', false], ['mlb', '#diamond', '#fieldCanvas', false]]) {
  await page.goto(`http://localhost:${PORT}/#${sport}`); await page.waitForTimeout(2500);
  const f = frame(); await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(1800);
  if (start) { await f.click('text=Iniciar Quick Game').catch(() => {}); await page.waitForTimeout(2500); }
  check(`${sport}: "3D (PlayCanvas)" is in the Visual menu`, await f.evaluate(() => [...document.querySelectorAll('#optVisual option')].some(o => o.value === '3d')));
  await f.selectOption('#optVisual', '3d'); await page.waitForFunction(() => true); await page.waitForTimeout(2500);
  const info = await f.evaluate(() => window.__asu3d); const c = await f.evaluate(() => { const e = document.querySelector('.asu-3d-canvas'); return e ? { w: e.width, h: e.height, op2d: getComputedStyle(document.querySelector('canvas:not(.asu-3d-canvas)')).opacity } : null; });
  check(`${sport}: 3D stage mounted (WebGL2, engine ${info?.version})`, !!info && info.device === 'webgl2' && !!c && c.w > 100 && c.h > 100, JSON.stringify(info));
  if (sport === 'nfl' && OUT) await page.screenshot({ path: `${OUT}/render3d_stage.png` });
  check(`${sport}: the 2D canvas is hidden (opacity 0) under the 3D one`, c?.op2d === '0');
  const h0 = await heap();
  for (let i = 0; i < 10; i++) { await f.selectOption('#optVisual', 'sheet'); await page.waitForTimeout(250); await f.selectOption('#optVisual', '3d'); await page.waitForTimeout(700); }
  await f.selectOption('#optVisual', 'sheet'); await page.waitForTimeout(500);
  const left = await f.evaluate(() => ({ n: document.querySelectorAll('.asu-3d-canvas').length, op: getComputedStyle(document.querySelector('canvas')).opacity }));
  check(`${sport}: 10 mount/unmount cycles leave no 3D canvas and restore the 2D one`, left.n === 0 && left.op === '1', JSON.stringify(left));
  const h1 = await heap(); check(`${sport}: JS heap growth after 10 cycles < 25 MB`, h1 - h0 < 25, `${h0.toFixed(1)} → ${h1.toFixed(1)} MB`);
}
check('no JS errors', errs.length === 0, errs.slice(0, 2).join(' | ')); check('no WebGL context warnings', warns.length === 0, warns.slice(0, 1).join(''));
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
