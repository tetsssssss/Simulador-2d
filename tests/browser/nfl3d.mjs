// Etapa 4 browser test: the NFL game playing in the 3D visual mode with a fixed seed.
//   python3 -m http.server 8300 &  node tests/browser/nfl3d.mjs [port] [outDir]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const PORT = process.argv[2] || 8300, OUT = process.argv[3], PLAYS = 6, SEED = 'EQ3D';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let pass = 0, fail = 0; const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
async function run(mode) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 850 } }); await ctx.addInitScript(([m]) => { localStorage.setItem('asu_visual_mode', m); }, [mode]);
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|blocked by CORS|github\.com\/nflverse/.test(m.text())) errs.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/#nfl`); await page.waitForTimeout(2500);
  const f = page.frames().find(x => x !== page.mainFrame()); await f.evaluate(() => { location.hash = '#play'; }); await page.waitForTimeout(1500);
  await f.fill('#seedIn', SEED).catch(() => {}); await f.click('text=Iniciar Quick Game'); await page.waitForTimeout(3500);
  const out = { errs, page, f, clips: new Set(), worst: 0, samples: 0, picked: null, shot: false };
  await f.click('button[data-speed="4"]').catch(() => {}); await f.evaluate(() => { const x = document.querySelector('#autoBtn'); if (x && !x.classList.contains('on')) x.click(); });
  for (let i = 0; i < 400; i++) {
    await page.waitForTimeout(300);
    if (mode === '3d') {
      const s = await f.evaluate(() => { const r = window.__asu3dRenderer; if (!r?.ready || r.simT() < 0.6) return null; const tag = document.querySelector('#callTag')?.textContent || ''; return r.athletes().filter(a => a.e).map(a => { const p = a.entity.getPosition(); return { id: a.e.id, slot: a.e.slot, t: r.simT(), hk: r.lastHuddle(), tag, clip: a.clip, wx: p.x, wz: p.z, sx: a.e.pos.x * 0.9144, sy: -a.e.pos.y * 0.9144 }; }); });
      if (s?.length === 22) { out.samples++; for (const a of s) { out.clips.add(a.clip); const d = Math.hypot(a.wx - a.sx, a.wz - a.sy); if (d > out.worst) { if (d > 3) out.dump = 'hk=' + s[0].hk + ' ' + s.map(x => x.slot + ':' + x.clip + ':' + Math.hypot(x.wx - x.sx, x.wz - x.sy).toFixed(1)).join(' '); out.worst = d; out.worstWho = a.slot + ' ' + a.clip + ' simT=' + a.t.toFixed(2) + ' tag=' + JSON.stringify(a.tag.slice(0, 30)); } } }
      if (!out.picked && s?.length === 22) {
        const target = await f.evaluate(() => { const r = window.__asu3dRenderer, a = r.athletes().find(x => x.e && x.number); const sc = r.screenOf(a.e.id); const c = document.querySelector('#fieldCanvas').getBoundingClientRect(); return sc && { id: a.e.id, name: a.name, x: c.left + sc.x, y: c.top + sc.y, inside: sc.x > 0 && sc.y > 0 && sc.x < c.width && sc.y < c.height }; });
        if (target?.inside) { const off = await (await f.frameElement()).boundingBox();   // the game lives in an iframe: add its offset to page coordinates
          await page.mouse.click(off.x + target.x, off.y + target.y); await page.waitForTimeout(400); out.picked = { want: target.name, shown: await f.evaluate(() => document.querySelector('#pcard')?.textContent || '') }; }
      }
      if (!out.shot && OUT && out.samples > 12) { out.shot = true; await page.screenshot({ path: `${OUT}/nfl3d_play.png` }); }
    }
    const logs = await f.evaluate(() => [...document.querySelectorAll('#log .logline')].map(e => e.textContent.trim()).filter(Boolean)); out.logs = logs;
    if (logs.length >= PLAYS + 2) break;
  }
  return out;
}
const d3 = await run('3d');
check('3D mode ran: renderer ready and 22 athletes sampled many times', d3.samples > 20, `${d3.samples} samples`);
check('athletes within 0.6 m of the simulation positions in every sample (measured after the huddle; interpolation + contact pull)', d3.worst < 0.6, `${d3.worst.toFixed(3)} m ${d3.worstWho || ''} | ${d3.dump || ''}`);
check('several different clips played (locomotion + actions)', d3.clips.size >= 4, [...d3.clips].join(','));
check('clicking in the 3D view selects an athlete (player card opens with a name, position and number)', !!d3.picked && /#\d+/.test(d3.picked.shown) && /energia/.test(d3.picked.shown), JSON.stringify(d3.picked)?.slice(0, 100));
const dec = await d3.f.evaluate(() => window.__asu3dRenderer.athletes().filter(a => a.decals).length);
check('own HD athletes carry number / name decals (>= 20 of the 22)', dec >= 20, dec + ' athletes');
check('no JS errors in 3D mode', d3.errs.length === 0, d3.errs.slice(0, 2).join(' | '));
const d2 = await run('sheet');
const L3 = d3.logs.slice(-PLAYS).reverse().slice(0, PLAYS), L2 = d2.logs.slice(-PLAYS).reverse().slice(0, PLAYS), k = Math.min(d3.logs.length, d2.logs.length, PLAYS);
const first = (a, n) => a.slice().reverse().slice(0, n).join(' || ');
check(`same seed => same plays in 3D and 2D (first ${k} log entries identical)`, k >= 4 && first(d3.logs, k) === first(d2.logs, k), `${k} entries`);
console.log(`\n${pass}/${pass + fail} checks passed`); await b.close(); process.exit(fail ? 1 : 0);
