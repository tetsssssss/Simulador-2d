// Auto quality in a real page: SwiftShader is slow, so 'auto' must step down; a fixed level must stay put.   node tests/browser/autoq3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
async function run(q) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 700 } }); await ctx.addInitScript(v => { localStorage.setItem('asu_3d_fullhd', '0'); localStorage.setItem('asu_visual_mode', '3d'); localStorage.setItem('asu_3d_quality', v || 'auto'); }, q);   // the default is now 'high', so 'auto' is chosen explicitly
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#nhl`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(() => { location.hash = '#rink'; }); await page.waitForTimeout(2500);
  const t0 = await f.evaluate(() => window.__asu3d?.quality); await page.waitForTimeout(70000);
  const r = await f.evaluate(() => window.__asu3d && { q: window.__asu3d.quality, ch: window.__asu3d.autoChanges || 0 }); await ctx.close(); return { t0, r, errs };
}
const a = await run(null), h = await run('high');
check('auto starts at medium', a.t0 === 'medium', a.t0);
check('auto stepped down on the slow software renderer', a.r?.ch >= 1 && ['low'].includes(a.r.q), JSON.stringify(a.r));
check('fixed "high" stays high (no auto changes)', h.t0 === 'high' && h.r?.q === 'high' && h.r.ch === 0, JSON.stringify(h.r));
check('no JS errors', !a.errs.length && !h.errs.length, (a.errs[0] || h.errs[0] || ''));
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
