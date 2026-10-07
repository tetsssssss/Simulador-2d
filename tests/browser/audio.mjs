// Audio sound-design check (headless Chromium): every recipe renders offline with finite, audible, non-clipping output,
// the live engine mixes through the limiter, panning/far/delay options work, beds + ducking run, 0 page errors.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const port = process.argv[2] || 8200; let fails = 0;
const ok = (c, m, extra = '') => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}${extra ? ' — ' + extra : ''}`); if (!c) fails++; };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
const pg = await b.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.route(/mlbstatic|statsapi|nhle|espn|githubusercontent/, r => r.abort());
await pg.goto(`http://localhost:${port}/nhl/index.html#rink`); await pg.waitForSelector('#rinkCanvas'); await pg.mouse.click(300, 300); await pg.waitForTimeout(800);
const res = await pg.evaluate(async () => {
  const A = await import('/core/audio/audioEngine.js'); const out = {};
  for (const n of A.RECIPE_NAMES) out[n] = await A.renderRecipeOffline(n, { power: 1, len: 1, notes: undefined }, 5);
  return out;
});
for (const [n, r] of Object.entries(res)) ok(r && Number.isFinite(r.peak) && r.peak > 0.04 && r.peak <= 0.95 && r.rms > 0.0008, `recipe ${n}`, r ? `peak ${r.peak.toFixed(2)} rms ${r.rms.toFixed(3)} tail ${r.tail.toFixed(2)}s` : 'not rendered');
const live = await pg.evaluate(async () => {
  const A = await import('/core/audio/audioEngine.js'); const a = A.getAudio(); a.unlock(); await new Promise(r => setTimeout(r, 400));
  const o = { running: a.running, plays: [], venue: a.venue };
  a.setAmbience('ice'); a.setCrowd(80); a.setBedLevel('skates', 0.8); await new Promise(r => setTimeout(r, 600));
  o.bed = a.level().rms;
  for (const n of ['goalHorn', 'slapShot', 'cheer', 'organCharge', 'padsCrunch', 'puckPost']) { o.plays.push([n, a.play(n, { category: n === 'organCharge' ? 'MUSIC' : n === 'cheer' ? 'CROWD' : 'GAME_EFFECT', pan: -0.6, far: 0.2, delay: 0.05 })]); }
  let peak = 0; for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 60)); peak = Math.max(peak, a.level().peak); }
  o.peak = peak; a.duck(0.4, 300); o.ducked = true; await new Promise(r => setTimeout(r, 450)); a.unduck();
  a.setVenue('ballpark'); o.venue2 = a.venue; o.unknown = a.play('nope'); a.setCrowd(0); a.setBedLevel('skates', 0); a.setAmbience(null);
  return o;
});
ok(live.running, 'AudioContext running after a gesture'); ok(live.plays.every(p => p[1]), 'live play() accepted for all sample sounds', live.plays.map(p => p.join(':')).join(' '));
ok(live.bed > 0.0005, 'ambience+crowd+skate beds audible', live.bed.toFixed(4)); ok(live.peak > 0.02 && live.peak <= 1, 'master output peaks within the limiter', live.peak.toFixed(2));
ok(live.venue === 'arena' && live.venue2 === 'ballpark', 'venue follows ambience (ice → arena) and can be switched'); ok(live.unknown === false, 'unknown recipe is rejected');
ok(errs.length === 0, 'no JS errors', errs.join(' | '));
console.log(`\n${fails ? 'FAILED ' + fails : 'all'} audio checks ${fails ? '' : 'passed'}`); await b.close(); process.exit(fails ? 1 : 0);
