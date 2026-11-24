// Etapa 6: weather layer over the 3D NFL view (same forecast as the 2D game).   node tests/browser/weather3d.mjs [port]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
for (const mode of ['rain', 'clear']) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 800 } }); await ctx.addInitScript(m => { localStorage.setItem('asu_visual_mode', '3d'); localStorage.setItem('asu_weather', m); }, mode);
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#nfl`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(() => { location.hash = '#play'; }); await page.waitForTimeout(1500);
  await f.click('text=Iniciar Quick Game'); await page.waitForTimeout(3000); await f.waitForFunction(() => window.__asu3dRenderer?.ready, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(2500);
  const r = await f.evaluate(() => { const r = window.__asu3dRenderer, cv = document.getElementById('wx3d'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { kind: r.weather(), px: n }; });
  check(`weather=${mode}: kind and drawn pixels`, r.kind === mode && (mode === 'clear' ? r.px === 0 : r.px > 500), JSON.stringify(r));
  check(`weather=${mode}: no JS errors`, errs.length === 0, errs[0] || ''); await ctx.close();
}
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
