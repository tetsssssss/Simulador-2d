// Etapa 2 browser test: the 3D gallery loads every kit with two team colour sets, clips cross-fade, no errors.
//   python3 -m http.server 8300 &  node tests/browser/athletes3d.mjs [port] [outDir]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, OUT = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1400, height: 700 } }); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
await page.goto(`http://localhost:${PORT}/core/render3d/gallery.html?auto=0`); await page.waitForFunction(() => window.__gallery?.ready, null, { timeout: 60000 }).catch(() => {});
const g = await page.evaluate(() => window.__gallery && { count: window.__gallery.count, list: window.__gallery.athletes() });
check('gallery loaded: 6 kits × 2 teams = 12 athletes', g?.count === 12, JSON.stringify(g?.count));
check('first clip of every athlete is playing (idle / glide / ready)', g?.list.every(a => ['mv_idle', 'hk_glide', 'gk_ready'].includes(a.clip)), g?.list.map(a => a.clip).join(','));
await page.waitForTimeout(1500); if (OUT) await page.screenshot({ path: `${OUT}/athletes3d_idle.png` });
await page.evaluate(() => window.__gallery.advance()); await page.waitForTimeout(900); if (OUT) await page.screenshot({ path: `${OUT}/athletes3d_run.png` });
const run = await page.evaluate(() => window.__gallery.athletes().map(a => a.clip)); check('after advance every athlete cross-faded to its run clip', run.every(c => ['mv_run', 'hk_skate', 'gk_butterfly', 'mv_jog'].includes(c)), run.join(','));
await page.evaluate(() => window.__gallery.advance()); await page.waitForTimeout(900); if (OUT) await page.screenshot({ path: `${OUT}/athletes3d_celebrate.png` });
const cel = await page.evaluate(() => window.__gallery.athletes().map(a => a.clip)); check('then to the celebration / signal clip', cel.every(c => ['gs_arms_up', 'gk_ready', 'rf_touchdown'].includes(c)), cel.join(','));
check('no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
