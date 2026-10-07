// Adaptive attributes (the 30 "today" ratings). PURE: same player + same context => same 30 numbers.
// They are no longer a re-roll: every value is built from a base trait (the fixed ratings) plus real context terms
//   form (rolling box window) · fatigue (pitch count / rest / plate appearances) · confidence (recent results) ·
//   matchup (history vs this opponent + platoon) · stadium (park factors, home/road) · pressure (leverage index) ·
//   recent sequence (last PAs / pitches) · game situation (inning, score, runners, outs, count).
// Each attribute also returns its `drivers` ([{ label, pts }]) so the UI can say WHY it moved.
// Convention: 0..100, higher = better for the player, except two attributes flagged in INVERTED
// ("Cold Zone Vulnerability", "Injury Risk Today") where higher = worse. "Fatigue" is FRESHNESS (100 = fully fresh).
// The only randomness is a seeded hash jitter (+-1.5) from player id + ctx.day (a per-day trait, never per-call).

export const ADAPTIVE_NAMES = ['Form', 'Confidence', 'Fatigue', 'Sharpness', 'Timing Today', 'Pitch Recognition Today', 'Plate Patience Today', 'Aggressiveness',
  'Hot Zone Feel', 'Cold Zone Vulnerability', 'RISP Confidence', 'Late-Inning Poise', 'Home Comfort', 'Road Comfort', 'vs R Matchup', 'vs L Matchup',
  'Pitch Arsenal Feel', 'Fastball Command Today', 'Breaking Command Today', 'Offspeed Command Today', 'Velocity Today', 'Bullpen Readiness', 'Recovery State',
  'Fielding Focus', 'Throwing Rhythm', 'Baserunning Instinct Today', 'Steal Readiness', 'Pressure Response', 'Momentum', 'Injury Risk Today'];
export const INVERTED = new Set(['Cold Zone Vulnerability', 'Injury Risk Today']);

// Hitting park factor (runs, ~1.00 neutral) by stadium name.
export const PARK_FACTORS = {
  'Coors Field': 1.17, 'Great American Ball Park': 1.07, 'Fenway Park': 1.06, 'Citizens Bank Park': 1.03, 'Yankee Stadium': 1.03, 'Globe Life Field': 1.0,
  'Truist Park': 1.01, 'Chase Field': 1.02, 'Wrigley Field': 1.02, 'Rate Field': 1.02, 'Angel Stadium': 0.99, 'Dodger Stadium': 1.0, 'Target Field': 1.0,
  'Kauffman Stadium': 1.0, 'Progressive Field': 0.98, 'Comerica Park': 0.98, 'American Family Field': 1.0, 'Daikin Park': 1.0, 'Rogers Centre': 1.02,
  'Oriole Park at Camden Yards': 1.01, 'Nationals Park': 1.0, 'PNC Park': 0.97, 'Busch Stadium': 0.97, 'Citi Field': 0.97, 'loanDepot park': 0.96,
  'Tropicana Field': 0.96, 'Sutter Health Park': 1.03, 'Petco Park': 0.95, 'T-Mobile Park': 0.93, 'Oracle Park': 0.92,
};
export const parkFactor = name => PARK_FACTORS[name] ?? 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const jitter = (key, amp) => ((hash(key) % 2001) / 1000 - 1) * amp; // seeded, deterministic, in [-amp, amp]
const PIT_POS = new Set(['P', 'SP', 'RP', 'TWP']);

// Approximate leverage index from inning / score / base-out state (1.0 = average plate appearance).
export function leverage(g = {}) {
  if (g.inning == null) return 1;
  const runners = (g.runners || []).filter(b => b >= 1 && b <= 3), outs = g.outs ?? 0;
  const risp = runners.some(b => b >= 2), n = runners.length;
  const base = (0.62 + 0.34 * n + (risp ? 0.32 : 0) + (n === 3 ? 0.35 : 0)) * (outs === 2 ? 1.12 : outs === 1 ? 1.0 : 0.9);
  const inn = clamp(g.inning, 1, 12), innF = inn <= 3 ? 0.78 : inn <= 6 ? 0.95 : inn === 7 ? 1.2 : inn === 8 ? 1.45 : 1.7;
  const diff = Math.abs(g.scoreDiff ?? 0), scoreF = diff <= 1 ? 1.25 : diff === 2 ? 1.0 : diff === 3 ? 0.7 : diff <= 5 ? 0.38 : 0.18;
  return clamp(base * innF * scoreF * (g.half === 'bottom' && inn >= 9 && (g.scoreDiff ?? 0) <= 0 ? 1.2 : 1), 0.1, 5);
}

const NEUTRAL_CTX = { recent: [], fatigue: { pitches: 0, outs: 0, daysRest: 4, pa: 0, consecutive: 0, recentPitches: 0 }, game: {}, park: {}, matchup: null, seq: [], opp: {} };

function sum(list, k) { return list.reduce((a, g) => a + (g[k] || 0), 0); }

function build(P, ctx) {
  const F = P.fixed || {}, f = (n, d = 60) => F[n] ?? d, pit = PIT_POS.has(P.pos);
  const fat = { ...NEUTRAL_CTX.fatigue, ...(ctx.fatigue || {}) }, g = ctx.game || {}, park = ctx.park || {}, opp = ctx.opp || {}, rec = ctx.recent || [], seq = ctx.seq || [];
  const out = {}; // name -> { base, drivers[] }
  const A = (name, base) => (out[name] = { base, drivers: [] });
  const add = (name, label, pts) => { if (Math.abs(pts) >= 0.5) out[name].drivers.push({ label, pts: Math.round(pts * 10) / 10 }); out[name].base += pts; };

  // ---- shared building blocks ----
  // Form: rolling window of the player's box lines (hitters: OPS-like index; pitchers: runs/9 + K-BB).
  let formPts = 0, formLabel = 'sem jogos recentes';
  if (!pit) {
    const ab = sum(rec, 'ab'), bb = sum(rec, 'bb'), idx = (sum(rec, 'h') + 0.7 * bb + 1.5 * sum(rec, 'hr') + 0.4 * sum(rec, 'd2') + 0.8 * sum(rec, 'd3') - 0.25 * sum(rec, 'k')) / Math.max(1, ab + bb);
    const shrink = ab / (ab + 22);
    formPts = clamp((idx - 0.33) * 85, -20, 20) * shrink;
    formLabel = ab ? `${sum(rec, 'h')}-${ab}, ${sum(rec, 'hr')} HR, ${sum(rec, 'k')} K nos últimos ${rec.length} jogos` : formLabel;
  } else {
    const outs = sum(rec, 'outs'), era = outs ? sum(rec, 'ra') * 27 / outs : 4.2, kbb = outs ? (sum(rec, 'ka') - sum(rec, 'bba')) / (outs / 3) : 0;
    const shrink = outs / (outs + 30);
    formPts = (clamp((4.2 - era) * 3.2, -20, 20) + clamp(kbb * 2.5, -8, 8)) * shrink * 0.9;
    formLabel = outs ? `${(outs / 3).toFixed(1)} IP, ${sum(rec, 'ra')} R, ${sum(rec, 'ka')} K nos últimos ${rec.length} jogos` : formLabel;
  }
  // Confidence: exponentially decayed last results (newest first weight 1).
  const RES = pit ? { K: 1.2, OUT: 0.5, BB: -1.2, H: -1.3, XBH: -1.8, HR: -3, HBP: -1 } : { HR: 3, XBH: 2, H: 1.5, BB: 0.5, OUT: -0.5, HARD_OUT: 0.3, K: -1.5 };
  let conf = 0, w = 1; for (let i = seq.length - 1; i >= 0; i--) { conf += (RES[seq[i]] ?? 0) * w; w *= 0.75; }
  const confPts = clamp(conf * 3.2, -18, 18);
  const confLabel = seq.length ? `últimos resultados: ${seq.slice(-4).join(' ')}` : 'sem sequência recente';
  // Freshness (Fatigue): pitchers by pitch count / rest; hitters by plate appearances and consecutive games.
  let fresh, freshDrv = [];
  if (pit) {
    const cap = 80 + 35 * ((f('Pitch Stamina') - 40) / 60), load = fat.pitches / Math.max(40, cap);
    const pen = 52 * Math.pow(load, 1.5), restPen = Math.max(0, 4 - fat.daysRest) * 5 + Math.min(14, fat.recentPitches * 0.06);
    fresh = 96 - pen - restPen; if (pen >= 1) freshDrv.push([`${fat.pitches} arremessos (limite ~${Math.round(cap)})`, -pen]); if (restPen >= 1) freshDrv.push([`descanso ${fat.daysRest}d / carga recente`, -restPen]);
  } else {
    const paPen = fat.pa * 1.1, conPen = Math.max(0, fat.consecutive - 8) * 1.6;
    fresh = 92 - paPen - conPen - Math.max(0, 3 - (fat.daysRest ?? 4)) * 2;
    if (paPen >= 1) freshDrv.push([`${fat.pa} aparições hoje`, -paPen]); if (conPen >= 1) freshDrv.push([`${fat.consecutive} jogos seguidos`, -conPen]);
  }
  fresh = clamp(fresh, 5, 99);
  const freshDelta = fresh - 90;
  const LI = leverage(g), hi = LI - 1; // >0 = high leverage
  const clutch = pit ? f('Pitching Clutch') : f('Clutch Hitting');
  const pf = parkFactor(park.stadium), isHome = !!park.home;

  // ---- 1..4 ----
  A('Form', 50 + (f('Consistency') - 60) * 0.2); add('Form', formLabel, formPts); add('Form', 'confiança recente', confPts * 0.25);
  A('Confidence', 50 + (f('Baseball IQ') - 60) * 0.1); add('Confidence', confLabel, confPts); add('Confidence', 'forma', formPts * 0.35);
  A('Fatigue', fresh); out.Fatigue.base = fresh; for (const [l, p] of freshDrv) out.Fatigue.drivers.push({ label: l, pts: Math.round(p * 10) / 10 });
  A('Sharpness', 50 + (f('Consistency') - 60) * 0.3); add('Sharpness', 'forma', formPts * 0.5); add('Sharpness', 'frescor', freshDelta * 0.3); add('Sharpness', 'confiança', confPts * 0.25);

  // ---- hitters' timing / eye / approach ----
  const oppVelo = opp.velo ?? 92, oppHand = opp.hand || null;
  A('Timing Today', f('Timing') * 0.55 + 25); add('Timing Today', 'forma', formPts * 0.5); add('Timing Today', 'frescor', freshDelta * 0.25);
  if (!pit) add('Timing Today', `velocidade do arremessador (${Math.round(oppVelo)} mph)`, -(oppVelo - 92) * 0.9 * (1 - f('Bat Speed') / 130));
  const mu = ctx.matchup || null, seen = mu?.pa || 0;
  A('Pitch Recognition Today', f('Plate Vision') * 0.55 + 22); add('Pitch Recognition Today', 'confiança', confPts * 0.3); add('Pitch Recognition Today', 'frescor', freshDelta * 0.25);
  add('Pitch Recognition Today', `${seen} aparições já vistas contra ${pit ? 'este rebatedor' : 'este arremessador'}`, Math.min(8, seen * 2.6) * (pit ? -0.6 : 1));
  A('Plate Patience Today', f('Plate Discipline') * 0.55 + 22); add('Plate Patience Today', 'confiança', confPts * 0.15);
  if (g.balls != null) { add('Plate Patience Today', `contagem ${g.balls}-${g.strikes}`, (g.balls > g.strikes ? 6 : 0) + (g.strikes === 2 ? -6 : 0)); }
  if (g.runners?.includes(3) && (g.outs ?? 0) < 2) add('Plate Patience Today', 'corredor na 3ª, menos de 2 outs', -4);
  add('Plate Patience Today', 'frescor', freshDelta * 0.12);
  A('Aggressiveness', 50 - (f('Plate Discipline') - 60) * 0.3 + (f('Bat Speed') - 60) * 0.1); add('Aggressiveness', 'confiança', confPts * 0.25);
  if (g.inning >= 7 && (g.scoreDiff ?? 0) < 0) add('Aggressiveness', 'perdendo no fim do jogo', 6);
  if (g.runners?.some(b => b >= 2)) add('Aggressiveness', 'corredor em posição', 4);
  if (g.strikes === 2) add('Aggressiveness', 'dois strikes (protege a zona)', -4);

  // ---- zones ----
  A('Hot Zone Feel', 50 + (f('Contact vs R') + f('Contact vs L') - 120) * 0.15); add('Hot Zone Feel', 'forma', formPts * 0.6); add('Hot Zone Feel', 'confiança', confPts * 0.3);
  add('Hot Zone Feel', `parque ${park.stadium || ''} (fator ${pf.toFixed(2)})`, pit ? (1 - pf) * 40 : (pf - 1) * 40); add('Hot Zone Feel', 'frescor', freshDelta * 0.12);
  A('Cold Zone Vulnerability', 52 - (f('Plate Vision') - 60) * 0.25 - (f('Plate Discipline') - 60) * 0.2); add('Cold Zone Vulnerability', 'forma', -formPts * 0.4); add('Cold Zone Vulnerability', 'cansaço', -freshDelta * 0.25);
  add('Cold Zone Vulnerability', 'confiança', -confPts * 0.2);

  // ---- pressure ----
  A('RISP Confidence', 50 + (clutch - 60) * 0.35); add('RISP Confidence', 'confiança', confPts * 0.3);
  if (g.runners?.some(b => b >= 2)) add('RISP Confidence', 'corredor em posição de pontuar', (clutch - 55) * 0.35 + confPts * 0.2 - (g.outs === 2 ? 2 : 0));
  A('Late-Inning Poise', 50 + (clutch - 60) * 0.3 + (f('Baseball IQ') - 60) * 0.1);
  if (g.inning >= 7) { const close = Math.abs(g.scoreDiff ?? 0) <= 2; add('Late-Inning Poise', `entrada ${g.inning}${close ? ', jogo apertado' : ''}`, (close ? 1 : 0.4) * ((clutch - 55) * 0.4 + confPts * 0.25)); }
  A('Pressure Response', 50 + (clutch - 60) * 0.35); add('Pressure Response', `alavancagem ${LI.toFixed(1)}`, hi * ((clutch - 55) * 0.3 + confPts * 0.25 + (f('Baseball IQ') - 60) * 0.1));
  add('Pressure Response', 'frescor', freshDelta * 0.1);

  // ---- stadium ----
  const homeTrait = jitter(`${P.id}|home|${ctx.day || ''}`, 5), roadTrait = jitter(`${P.id}|road|${ctx.day || ''}`, 5);
  A('Home Comfort', 52 + homeTrait); if (isHome) { add('Home Comfort', 'jogando em casa', 7); add('Home Comfort', `${park.stadium || 'parque'} (fator ${pf.toFixed(2)})`, pit ? (1 - pf) * 45 : (pf - 1) * 45); }
  A('Road Comfort', 48 + roadTrait + (f('Baseball IQ') - 60) * 0.1); if (park.stadium && !isHome) { add('Road Comfort', 'jogando fora', 3); add('Road Comfort', `${park.stadium} (fator ${pf.toFixed(2)})`, pit ? (1 - pf) * 45 : (pf - 1) * 45); }

  // ---- platoon / matchup ----
  const mhist = mu && mu.ab ? clamp(((mu.h || 0) / mu.ab - 0.24) * 40, -8, 8) * (mu.ab / (mu.ab + 3)) * (pit ? -1 : 1) : 0;
  const setSide = (name, hand) => {
    const isActive = oppHand === hand;
    if (!pit) {
      A(name, 22 + (f(`Contact vs ${hand}`) * 0.6 + f(`Power vs ${hand}`) * 0.4) * 0.65);
      const same = P.bats === hand ? 1 : 0, sw = P.bats === 'S';
      add(name, sw ? 'rebatedor ambidestro: sem desvantagem' : same ? `mesmo lado (${hand}): desvantagem de plateia` : `lado oposto (${hand}): vantagem`, sw ? 3 : same ? -5 : 4);
      if (isActive) { add(name, 'enfrenta este lado hoje', sw ? 1.5 : same ? -2.5 : 2.5); add(name, 'confronto de hoje', formPts * 0.2 + confPts * 0.2); if (mhist) add(name, 'histórico contra o arremessador', mhist); }
    } else {
      A(name, 22 + ((f('Fastball Quality') + f('Breaking Ball Quality') + f('Offspeed Quality')) / 3) * 0.65);
      const same = P.throws === hand; add(name, same ? `arremessador mesmo lado (${hand})` : `lado oposto (${hand})`, same ? 3.5 : -3);
      if (isActive) { add(name, 'enfrenta este lado hoje', same ? 2 : -2); add(name, 'confronto de hoje', formPts * 0.2 + confPts * 0.2); if (mhist) add(name, 'histórico contra o rebatedor', mhist); }
    }
  };
  setSide('vs R Matchup', 'R'); setSide('vs L Matchup', 'L');

  // ---- pitch families (pitchers: command; hitters: their read of each family) ----
  const tired = Math.min(0, freshDelta);
  A('Pitch Arsenal Feel', pit ? 28 + ((f('Fastball Quality') + f('Breaking Ball Quality') + f('Offspeed Quality')) / 3) * 0.6 : 28 + f('Plate Vision') * 0.45);
  add('Pitch Arsenal Feel', 'forma', formPts * 0.4); add('Pitch Arsenal Feel', 'confiança', confPts * 0.25); if (!pit) add('Pitch Arsenal Feel', 'aparições vistas', Math.min(8, seen * 2.6));
  const fam = (name, ratingPit, ratingHit, w) => { A(name, pit ? 22 + (ratingPit.reduce((a, n) => a + f(n), 0) / ratingPit.length) * 0.7 : 22 + (ratingHit.reduce((a, n) => a + f(n), 0) / ratingHit.length) * 0.7); add(name, 'forma', formPts * w); add(name, 'cansaço', tired * 0.55); add(name, 'confiança', confPts * 0.18); };
  fam('Fastball Command Today', ['Pitch Command', 'Fastball Quality'], ['Timing', 'Bat Speed'], 0.35);
  fam('Breaking Command Today', ['Pitch Control', 'Breaking Ball Quality'], ['Plate Vision', 'Contact vs R'], 0.3);
  fam('Offspeed Command Today', ['Pitch Control', 'Offspeed Quality'], ['Plate Discipline', 'Plate Vision'], 0.3);
  A('Velocity Today', pit ? 24 + f('Pitch Velocity') * 0.7 : 24 + f('Bat Speed') * 0.7); add('Velocity Today', 'frescor', freshDelta * (pit ? 0.4 : 0.15)); add('Velocity Today', 'forma', formPts * 0.12);
  if (pit && fat.pitches > 0) add('Velocity Today', `${fat.pitches} arremessos`, -Math.max(0, fat.pitches - 60) * 0.1);

  // ---- body ----
  A('Bullpen Readiness', pit ? 78 : 70); add('Bullpen Readiness', 'descanso', (fat.daysRest - 4) * 3); add('Bullpen Readiness', 'carga recente', -Math.min(30, fat.recentPitches * 0.18)); add('Bullpen Readiness', 'frescor hoje', freshDelta * 0.25);
  A('Recovery State', 68 + (f('Durability') - 60) * 0.25); add('Recovery State', 'descanso', (fat.daysRest - 4) * 3); add('Recovery State', 'jogos seguidos', -Math.max(0, fat.consecutive - 6) * 1.5);
  add('Recovery State', 'desgaste hoje', freshDelta * 0.3); if (P.age) add('Recovery State', `idade ${P.age}`, -Math.max(0, P.age - 31) * 1.2);
  A('Fielding Focus', 20 + (f('Fielding') + f('Hands')) / 2 * 0.7); add('Fielding Focus', 'confiança', confPts * 0.2); add('Fielding Focus', 'cansaço', tired * 0.3); add('Fielding Focus', 'erros recentes', -(ctx.errors || 0) * 5);
  if (g.inning >= 8 && Math.abs(g.scoreDiff ?? 0) <= 2) add('Fielding Focus', 'jogo apertado: foco máximo', 3);
  A('Throwing Rhythm', 20 + (f('Arm Accuracy') + f('Transfer Speed')) / 2 * 0.7); add('Throwing Rhythm', 'forma', formPts * 0.2); add('Throwing Rhythm', 'cansaço', tired * 0.35); add('Throwing Rhythm', 'erros recentes', -(ctx.errors || 0) * 4);
  A('Baserunning Instinct Today', 20 + (f('Baseball IQ') * 0.5 + f('Baserunning IQ') * 0.5) * 0.7); add('Baserunning Instinct Today', 'confiança', confPts * 0.25); add('Baserunning Instinct Today', 'frescor', freshDelta * 0.2);
  A('Steal Readiness', 18 + (f('Stealing') * 0.5 + f('Jump') * 0.3 + f('Running Speed') * 0.2) * 0.72); add('Steal Readiness', 'pernas (frescor)', freshDelta * 0.3);
  if (opp.hold != null) add('Steal Readiness', `controle de corredores do arremessador (${Math.round(opp.hold)})`, -(opp.hold - 60) * 0.25);
  if (opp.catcherArm != null) add('Steal Readiness', `braço do receptor (${Math.round(opp.catcherArm)})`, -(opp.catcherArm - 60) * 0.25);
  A('Momentum', 50); add('Momentum', 'resultados recentes', confPts * 0.8); if (g.momentum) add('Momentum', 'time marcou nas últimas entradas', clamp(g.momentum * 6, -15, 15));
  if (g.inning != null) add('Momentum', 'placar', clamp((g.scoreDiff ?? 0) * 1.5, -8, 8));
  A('Injury Risk Today', 10 + (100 - f('Durability')) * 0.22); add('Injury Risk Today', 'cansaço', -freshDelta * 0.3); add('Injury Risk Today', 'jogos seguidos', Math.max(0, fat.consecutive - 10) * 1.2);
  if (P.age) add('Injury Risk Today', `idade ${P.age}`, Math.max(0, P.age - 33) * 1.4);

  // seeded per-day trait jitter (stable for the same player + day; never for the same call with different context)
  for (const n of ADAPTIVE_NAMES) out[n].base += jitter(`${P.id}|${n}|${ctx.day || ''}`, 1.5);
  return out;
}

// computeAdaptive(player, ctx) -> { list:[{name,value,drivers,tip}], map, delta (value - neutral value), leverage }
// player: { id, pos, bats, throws, age?, fixed: { [fixedAttrName]: 0..99 } }
export function computeAdaptive(player, ctx = {}) {
  const P = { id: player.id ?? 0, pos: player.pos || 'DH', bats: player.bats || 'R', throws: player.throws || 'R', age: player.age, fixed: player.fixed || {} };
  const cur = build(P, ctx), neu = build(P, { day: ctx.day, park: {}, errors: 0 });
  const list = [], map = {}, delta = {};
  for (const n of ADAPTIVE_NAMES) {
    const value = Math.round(clamp(cur[n].base, 0, 100)), nv = Math.round(clamp(neu[n].base, 0, 100));
    const drivers = [...cur[n].drivers].sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts)).slice(0, 4);
    const tip = drivers.length ? drivers.map(d => `${d.pts > 0 ? '+' : ''}${d.pts} ${d.label}`).join(' · ') : 'Sem fatores de contexto ativos: valor-base do jogador.';
    list.push({ name: n, value, drivers, tip, inverted: INVERTED.has(n) }); map[n] = value; delta[n] = value - nv;
  }
  return { list, map, delta, leverage: leverage(ctx.game || {}) };
}
