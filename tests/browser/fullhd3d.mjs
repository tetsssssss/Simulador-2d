// Full HD 3D: with the default settings (quality high, Full HD on) the drawing buffer is >= 1900 px wide in the three sports; switching Full HD off gives the 1x buffer; the menu shows the defaults.
//   python3 -m http.server 8300 &  node tests/browser/fullhd3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
async function run(sport, route, start, fullhd) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addInitScript(f => { localStorage.setItem('asu_visual_mode', '3d'); if (f === '0') localStorage.setItem('asu_3d_fullhd', '0'); }, fullhd);
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#${sport}`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(r => { location.hash = r; }, route); await page.waitForTimeout(2000); if (start) await f.click('text=Iniciar Quick Game').catch(() => {});
  await f.waitForFunction(() => window.__asu3dRenderer?.ready, null, { timeout: 40000 }).catch(() => {}); await page.waitForTimeout(2500);
  const r = await f.evaluate(() => { const c = document.querySelector('.asu-3d-canvas'), st = window.__asu3dStage; return c && { w: c.width, h: c.height, cssW: Math.round(c.getBoundingClientRect().width), q: window.__asu3d?.quality }; });
  await ctx.close(); return { r, errs };
}
for (const [sport, route, start] of [['nfl', '#play', true], ['nhl', '#rink', false], ['mlb', '#diamond', false]]) {
  const on = await run(sport, route, start, '1'), off = await run(sport, route, start, '0');
  check(`${sport}: default = high quality and the buffer is Full HD (>= 1900 px wide, css ${on.r?.cssW})`, on.r?.q === 'high' && on.r.w >= 1900, JSON.stringify(on.r));
  check(`${sport}: Full HD off => 1x buffer`, off.r && off.r.w <= off.r.cssW * 1.05, JSON.stringify(off.r));
  check(`${sport}: no JS errors`, on.errs.length === 0 && off.errs.length === 0, [...on.errs, ...off.errs][0] || '');
}
// the menu reflects the defaults (Qualidade 3D = Alta, Full HD checked)
{ const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage(); await page.goto(`http://localhost:${PORT}/`); await page.waitForTimeout(2500);
  await page.click('#suAudioBtn'); await page.waitForTimeout(500);
  const ok = await page.evaluate(() => { const q = document.querySelector('#suQ3'), h = document.querySelector('#suFhd'); return { q: q?.value, fhd: h?.checked, exists: !!q && !!h }; });
  check('menu (🔊): Qualidade 3D = high and "Full HD no 3D" checked by default', ok.exists && ok.q === 'high' && ok.fhd === true, JSON.stringify(ok)); await ctx.close(); }
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
