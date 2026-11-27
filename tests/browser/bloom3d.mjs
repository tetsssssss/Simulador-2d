// Bloom: quality high + Bloom on => the engine's CameraFrame is active (HDR + bloom + tone map); Bloom off or quality medium => plain rendering. No JS errors.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
for (const [q, bl, want] of [['high', '1', true], ['high', '0', false], ['medium', '1', false]]) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 750 } }); await ctx.addInitScript(([q, bl]) => { localStorage.setItem('asu_visual_mode', '3d'); localStorage.setItem('asu_3d_fullhd', '0'); localStorage.setItem('asu_3d_quality', q); localStorage.setItem('asu_3d_bloom', bl); }, [q, bl]);
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/#nhl`); await page.waitForTimeout(2500); const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(() => { location.hash = '#rink'; }, null);
  await f.waitForFunction(() => window.__asu3dRenderer?.ready, null, { timeout: 40000 }).catch(() => {}); await page.waitForTimeout(2500);
  const on = await f.evaluate(() => !!window.__asu3dStageApi?.frameActive?.());
  check(`quality ${q}, bloom ${bl}: post-processing ${want ? 'active' : 'off'}`, on === want, String(on));
  check(`quality ${q}, bloom ${bl}: no JS errors`, errs.length === 0, errs[0] || ''); await ctx.close();
}
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
