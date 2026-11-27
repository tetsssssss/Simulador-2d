// Etapa 3 browser test: a real NFL play frozen on the 3D field: 22 athletes exactly where the simulation put them, ball, lines, camera, no errors.
//   python3 -m http.server 8300 &  node tests/browser/field3d.mjs [port] [outDir]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, OUT = process.argv[3];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1400, height: 720 } }); const errs = [];
page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
for (const cam of ['broadcast', 'tactical', 'end']) {
  await page.goto(`http://localhost:${PORT}/core/render3d/field.html?cam=${cam}`); await page.waitForFunction(() => window.__field?.ready, null, { timeout: 90000 }).catch(() => {}); await page.waitForTimeout(1500);
  const f = await page.evaluate(() => window.__field && { count: window.__field.count, list: window.__field.list() });
  if (cam === 'broadcast') {
    check('22 athletes on the field (11 offence, 11 defence)', f?.count === 22 && f.list.filter(a => a.side === 'off').length === 11);
    const worst = Math.max(...f.list.map(a => Math.hypot(a.world[0] - a.want[0], a.world[2] - a.want[2])));
    check('every athlete stands exactly where the simulation put it (max error < 1 cm)', worst < 0.01, `${(worst * 100).toFixed(3)} cm`);
    check('defence in the athletic-ready stance, offence idle', f.list.every(a => a.clip === (a.side === 'def' ? 'mv_athletic_ready' : 'mv_idle')));
  }
  if (OUT) await page.screenshot({ path: `${OUT}/field3d_${cam}.png` });
}
check('no JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
