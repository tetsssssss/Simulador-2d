// Trade AI: value is NOT just overall. An asset (player or draft pick) is valued by the evaluating team from age and growth
// curve, production, attributes (current vs potential, weighted by the team's competitive window), positional scarcity,
// contract surplus, injuries, positional need and draft capital. evaluate() answers accept / counter-offer / reasons;
// aiTradeRound() runs AI-to-AI trades (more active before the deadline); the trade block lists who is shopped.
import { teamPlayers, teamOf, news } from './careerCore.js';
import { marketValue, newRelation } from './people.js';
import { pickProjection, teamPicks, tradePick, pickOwner, pickKey, findPick, nextDraftYear } from './picks.js';
import { clamp, round1, difficultyOf, dayOfSlate, xr } from './kit.js';

const CACHE = new WeakMap();
function leagueIndex(spec, c) {
  let m = CACHE.get(c); if (m && m.day === c.x.cal.day && m.season === c.season) return m;
  const byG = {}, prod = {};
  for (const p of Object.values(c.players)) { if (p.st === 'RET' || p.t === 'FA' || p.st === 'PROSPECT') continue; (byG[spec.posGroup(p.pos)] ||= []).push(p); }
  for (const [g, l] of Object.entries(byG)) { l.sort((a, b) => b.ovr - a.ovr); const pr = l.filter(p => p.ps?.gp >= 3).map(p => spec.v3.prodOf(p) / Math.max(1, p.ps.gp)).sort((a, b) => a - b); prod[g] = pr; }
  m = { day: c.x.cal.day, season: c.season, byG, prod }; CACHE.set(c, m); return m;
}
export function teamContext(spec, c, abbr) {
  const t = teamOf(c, abbr), list = teamPlayers(c, abbr);
  const picks = teamPicks(spec, c, abbr, { years: 2 });
  return { abbr, mode: t?.mode || 'middle', need: spec.teamNeeds ? spec.teamNeeds(list.filter(p => p.st !== 'MIN')) : {}, picks: picks.length, picksFirst: picks.filter(p => p.r === 1).length, list };
}
const stageOf = (spec, p) => { const a = spec.ageCurve; return p.age <= a.growthEnd ? 'grow' : p.age <= a.peakEnd ? 'peak' : 'old'; };

// Value (arbitrary units; ~30 = solid starter, ~65 = star) of player p for the evaluating team described by ctx.
export function assetValue(spec, c, p, ctx, { why } = {}) {
  const note = (k, v) => { if (why) why[k] = v; };
  const mode = ctx.mode, now = Math.pow(Math.max(0, p.ovr - 45) / 50, 2.2) * 100, fut = Math.pow(Math.max(0, p.pot - 45) / 50, 2.2) * 100;
  const wNow = mode === 'contender' ? 0.8 : mode === 'rebuild' ? 0.3 : 0.55;
  let v = wNow * now + (1 - wNow) * fut; note('base', round1(v));
  const a = spec.ageCurve, st = stageOf(spec, p);
  let am = st === 'grow' ? 1.15 : st === 'peak' ? 1.0 : Math.max(0.3, 1 - 0.13 * (p.age - a.peakEnd));
  if (mode === 'rebuild') am *= st === 'old' ? 0.7 : st === 'grow' ? 1.12 : 1;
  if (mode === 'contender' && st === 'grow' && p.ovr < 68) am *= 0.9;
  if (p.cv === 'RAPID' && st !== 'grow') am *= 0.88; if (p.cv === 'LONG' && st === 'old') am *= 1.12; if (p.cv === 'PRODIGY' && st === 'grow') am *= 1.06;
  v *= am; note('age', round1(am * 100) / 100);
  const g = spec.posGroup(p.pos), idx = leagueIndex(spec, c), scar = spec.v3.scarcity?.[g] ?? 1;
  const pr = idx.prod[g];
  if (pr?.length > 20 && p.ps?.gp >= 3) { const x = spec.v3.prodOf(p) / p.ps.gp; let lo = 0, hi = pr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pr[m] < x) lo = m + 1; else hi = m; } const pct = lo / pr.length; const pm = 0.92 + pct * 0.16; v *= pm; note('production', round1(pm * 100) / 100); }
  const trend = 1 + clamp((p.dv || 0) * 0.012, -0.05, 0.05); v *= trend;
  const depth = idx.byG[g]?.length || 1, rank = idx.byG[g] ? idx.byG[g].findIndex(q => q.id === p.id) : -1, topPct = rank < 0 ? 0.5 : rank / depth;
  const sm = Math.pow(scar, 0.6) * (topPct < 0.05 ? 1.08 : topPct < 0.15 ? 1.03 : 1); v *= sm; note('scarcity', round1(sm * 100) / 100);
  if (p.c && p.t !== 'FA') {
    const yrs = Math.min(p.c.yrs, 4), surplus = ((marketValue(spec, p) - p.c.sal) * yrs) / (spec.salary.max / 40) * (spec.trade.surplusWeight || 1);
    const bounded = clamp(surplus, -Math.max(12, v * 0.9), Math.max(12, v * 0.7)); v += bounded; note('contract', round1(bounded));
    if (p.c.yrs <= 1 && mode === 'rebuild' && st !== 'grow') v *= 0.85;
  }
  if (p.inj) { const im = p.inj.games > 20 ? (mode === 'contender' ? 0.5 : 0.62) : p.inj.games > 6 ? 0.85 : 0.95; v *= im; note('injury', im); }
  const need = ctx.need?.[g]; if (need) { v *= 1.18; note('need', 1.18); }
  if (p.role === 'S' && ctx.abbr && p.t === ctx.abbr) v *= 1.04;
  return Math.max(-15, round1(v));
}
export function pickValue(spec, c, pick, ctx) {
  const n = c.teams.length, slot = pickProjection(spec, c, pick), y0 = nextDraftYear(c);
  let v = 95 * Math.exp(-slot / (n * 0.8)) * Math.pow(0.9, pick.y - y0);
  v *= ctx.mode === 'rebuild' ? 1.25 : ctx.mode === 'contender' ? 0.8 : 1;
  if ((ctx.picks || 0) < spec.draft.rounds * 1.2) v *= 1.08;
  return round1(v);
}

function resolveAssets(spec, c, team, side, errors) {
  const players = [], picks = [];
  for (const id of side?.players || []) { const p = c.players[id]; if (!p) { errors.push(`Jogador ${id} inexistente`); continue; } if (p.t !== team) { errors.push(`${p.n} não pertence a ${team}`); continue; } if (p.mine && team !== c.userTeam) continue; players.push(p); }
  for (const pk of side?.picks || []) {
    const k = typeof pk === 'string' ? findPick(c, pk) : pk;
    if (pickOwner(c, k.y, k.r, k.o) !== team) { errors.push(`Escolha ${k.y} R${k.r} (${k.o}) não pertence a ${team}`); continue; }
    if (k.y < nextDraftYear(c)) { errors.push(`Escolha ${k.y} R${k.r} já foi usada`); continue; }
    picks.push({ ...k, t: team });
  }
  return { players, picks };
}
export function tradeWindowOpen(spec, c) {
  if (c.phase === 'PLAYOFFS') return false;
  if (c.phase === 'REGULAR') return c.x.cal.day <= deadlineDay(spec, c);
  return true;
}
export const deadlineDay = (spec, c) => Math.floor(dayOfSlate(spec, c.slates) * 0.62);

// offer = { from, to, give: { players: [ids], picks: [{y,r,o}|"y-r-o"] }, get: { players, picks } }
// `from` sends `give` to `to` and receives `get`. `to` is the evaluating (AI) team.
export function evaluate(spec, c, offer) {
  const errors = [], reasons = [], { from, to } = offer;
  const give = resolveAssets(spec, c, from, offer.give, errors), get = resolveAssets(spec, c, to, offer.get, errors);
  const res = (accept, extra = {}) => ({ accept, counterOffer: null, reasons, errors, valueIn: 0, valueOut: 0, ...extra });
  if (errors.length) { reasons.push(...errors); return res(false, { legal: false }); }
  if (!give.players.length && !give.picks.length && !get.players.length && !get.picks.length) { reasons.push('Oferta vazia.'); return res(false, { legal: false }); }
  if (!tradeWindowOpen(spec, c)) { reasons.push('A janela de trocas está fechada (prazo final da temporada).'); return res(false, { legal: false }); }
  if (give.players.some(p => p.rfaLock) || get.players.some(p => p.mine)) { reasons.push('Esse jogador não pode ser negociado.'); return res(false, { legal: false }); }
  const legalText = spec.v3.validateTrade?.(spec, c, { aiTeam: to, userTeam: from, give: give.players, get: get.players });
  if (legalText) { reasons.push(legalText); return res(false, { legal: false }); }
  const ctx = teamContext(spec, c, to);
  const diff = difficultyOf(c);
  const vals = { in: [], out: [] };
  let valueIn = 0, valueOut = 0;
  for (const p of give.players) { const why = {}, v = assetValue(spec, c, p, ctx, { why }); vals.in.push({ id: p.id, name: p.n, value: v, why }); valueIn += v; }
  for (const k of give.picks) { const v = pickValue(spec, c, k, ctx); vals.in.push({ key: pickKey(k.y, k.r, k.o), name: `Escolha ${k.y} R${k.r}`, value: v }); valueIn += v; }
  for (const p of get.players) { const why = {}, v = assetValue(spec, c, p, ctx, { why }); vals.out.push({ id: p.id, name: p.n, value: v, why }); valueOut += v; }
  for (const k of get.picks) { const v = pickValue(spec, c, k, ctx); vals.out.push({ key: pickKey(k.y, k.r, k.o), name: `Escolha ${k.y} R${k.r}`, value: v }); valueOut += v; }
  // does the trade open a positional hole in the evaluating team?
  const after = ctx.list.filter(p => !get.players.includes(p)).concat(give.players);
  const needAfter = spec.teamNeeds ? spec.teamNeeds(after.filter(p => p.st !== 'MIN')) : {};
  const holes = Object.keys(needAfter).filter(g => needAfter[g] && !ctx.need[g]);
  if (holes.length) { valueOut *= 1.2; reasons.push(`A troca deixaria ${to} sem profundidade em ${holes.join(', ')}.`); }
  // untouchables: the franchise player of a contender / the best prospect of a rebuilding team
  const star = [...ctx.list].sort((a, b) => b.ovr - a.ovr)[0];
  if (star && get.players.includes(star) && ctx.mode === 'contender' && star.ovr >= spec.starOvr) { valueOut *= 1.5; reasons.push(`${star.n} é peça central de um time que briga por título.`); }
  const best = [...ctx.list].filter(p => p.age <= 24).sort((a, b) => b.pot - a.pot)[0];
  if (best && get.players.includes(best) && ctx.mode === 'rebuild' && best.pot >= 80) { valueOut *= 1.4; reasons.push(`${best.n} é o futuro da reconstrução.`); }
  const margin = 1.03 + 0.07 * diff.aiTradeMargin * 10 / 3;
  const need = valueOut * margin + 2;
  if (ctx.mode === 'rebuild') reasons.push(give.picks.length || give.players.some(p => p.age <= 24) ? 'Em reconstrução: valoriza jovens e escolhas.' : 'Em reconstrução: pouco interesse em veteranos.');
  else if (ctx.mode === 'contender') reasons.push(give.players.some(p => p.age > spec.ageCurve.peakEnd - 3 && p.ovr >= spec.starOvr - 10) ? 'Briga por título: aceita veteranos que ajudam agora.' : 'Briga por título: quer reforços imediatos, não promessas.');
  for (const g of new Set(give.players.map(p => spec.posGroup(p.pos)))) if (ctx.need[g]) reasons.push(`Precisa de reforço em ${g}.`);
  for (const p of get.players) if (p.c && p.c.sal > marketValue(spec, p) * 1.25 && p.c.yrs >= 2) reasons.push(`Contrato de ${p.n} é pesado: ${p.c.sal}M até ${c.season + p.c.yrs}.`);
  for (const p of give.players) if (p.inj) reasons.push(`${p.n} está lesionado (${p.inj.games} jogos): valor reduzido.`);
  const accept = valueIn >= need;
  reasons.unshift(`${to} avalia: recebe ${round1(valueIn)} · envia ${round1(valueOut)} (exige ${round1(need)}).`);
  const out = res(accept, { valueIn: round1(valueIn), valueOut: round1(valueOut), need: round1(need), values: vals, ctx: { mode: ctx.mode, need: ctx.need }, legal: true });
  if (!accept) out.counterOffer = buildCounter(spec, c, offer, { give, get, ctx, valueIn, valueOut, need });
  else reasons.push(`${to} aceita a troca.`);
  return out;
}
function buildCounter(spec, c, offer, { give, get, ctx, valueIn, need }) {
  const gap = need - valueIn, from = offer.from;
  const taken = new Set(give.players.map(p => p.id)), takenK = new Set(give.picks.map(k => pickKey(k.y, k.r, k.o)));
  const pool = [];
  for (const p of teamPlayers(c, from)) if (!taken.has(p.id) && p.st !== 'MIN' && !p.mine) pool.push({ type: 'p', id: p.id, v: assetValue(spec, c, p, ctx), p });
  for (const k of teamPicks(spec, c, from, { years: 2 })) if (!takenK.has(k.key)) pool.push({ type: 'k', key: k.key, v: pickValue(spec, c, k, ctx), k });
  const good = pool.filter(a => a.v > 0).sort((a, b) => a.v - b.v);
  const one = good.find(a => a.v >= gap);
  const mk = adds => ({ from, to: offer.to, give: { players: [...give.players.map(p => p.id), ...adds.filter(a => a.type === 'p').map(a => a.id)], picks: [...give.picks.map(k => pickKey(k.y, k.r, k.o)), ...adds.filter(a => a.type === 'k').map(a => a.key)] }, get: { players: get.players.map(p => p.id), picks: get.picks.map(k => pickKey(k.y, k.r, k.o)) } });
  let counter = null;
  if (one) counter = mk([one]);
  else { const adds = []; let left = gap; for (const a of [...good].reverse()) { if (left <= 0) break; adds.push(a); left -= a.v; if (adds.length >= 3) break; } if (left <= 0 && adds.length) counter = mk(adds); }
  if (!counter && (get.players.length + get.picks.length) > 1) { // ask for less instead
    const worst = [...get.players.map(p => ({ type: 'p', id: p.id, v: assetValue(spec, c, p, ctx) })), ...get.picks.map(k => ({ type: 'k', key: pickKey(k.y, k.r, k.o), v: pickValue(spec, c, k, ctx) }))].sort((a, b) => b.v - a.v)[0];
    counter = { from, to: offer.to, give: { players: give.players.map(p => p.id), picks: give.picks.map(k => pickKey(k.y, k.r, k.o)) }, get: { players: get.players.filter(p => !(worst.type === 'p' && p.id === worst.id)).map(p => p.id), picks: get.picks.filter(k => !(worst.type === 'k' && pickKey(k.y, k.r, k.o) === worst.key)).map(k => pickKey(k.y, k.r, k.o)) } };
  }
  if (counter) { const check = evaluate(spec, c, counter); if (!check.accept) return null; counter.note = `Contraproposta de ${offer.to}`; }
  return counter;
}

// Executes a trade that evaluate() would accept (for the user's `from` team). Returns { ok, text, ...evaluate result }.
export function propose(spec, c, offer) {
  const r = evaluate(spec, c, offer);
  if (!r.accept) return { ok: false, text: r.reasons.find(x => x.includes('recus') || x.includes('janela') || x.includes('teto') || x.includes('pertence')) || `${offer.to} recusa a troca.`, ...r };
  const text = execute(spec, c, offer);
  return { ok: true, text, ...r };
}
export function execute(spec, c, offer, { quiet = false } = {}) {
  const errors = [], give = resolveAssets(spec, c, offer.from, offer.give, errors), get = resolveAssets(spec, c, offer.to, offer.get, errors);
  const rng = xr(c, `trade-${offer.from}-${offer.to}`);
  for (const p of give.players) { p.t = offer.to; p.rel = null; p.role = null; p.userRole = null; p.promise = null; if (p.on40 == null && spec.sport === 'mlb') p.on40 = true; }
  for (const p of get.players) { p.t = offer.from; if (offer.from === c.userTeam || (c.role === 'PLAYER' && offer.from === c.players[c.me?.id]?.t)) p.rel = newRelation(rng); else p.rel = null; p.role = null; p.userRole = null; }
  for (const k of give.picks) tradePick(c, k, offer.to);
  for (const k of get.picks) tradePick(c, k, offer.from);
  const desc = (pl, pk) => [...pl.map(p => `${p.n} (${p.pos}, ${p.ovr})`), ...pk.map(k => `escolha ${k.y} R${k.r}${k.o !== k.t ? ` (${k.o})` : ''}`)].join(', ') || 'nada';
  const text = `Troca: ${offer.from} envia ${desc(give.players, give.picks)} para ${offer.to} por ${desc(get.players, get.picks)}`;
  c.history.transactions.push({ s: c.season, kind: 'TRADE', text, teams: [offer.from, offer.to], players: [...give.players, ...get.players].map(p => p.id), picks: [...give.picks, ...get.picks].map(k => pickKey(k.y, k.r, k.o)), d: c.x.cal.day });
  if (!quiet) news(c, text + '.', 'big');
  for (const t of [offer.from, offer.to]) { spec.assignRoles(teamPlayers(c, t), c, t, { keepUser: t === c.userTeam }); if (spec.v3.enforceTeam && t !== c.userTeam) spec.v3.enforceTeam(spec, c, t, { cutToFA: p => { p.t = 'FA'; p.st = 'FA'; p.c = { sal: 0, yrs: 0, kind: 'FA' }; p.role = null; } }); }
  return text;
}

// ---------- trade block ----------
export function aiBlock(spec, c, abbr) {
  const ctx = teamContext(spec, c, abbr), a = spec.ageCurve, out = [];
  for (const p of ctx.list) {
    if (p.st === 'MIN' || p.st === 'PROSPECT' || p.mine) continue;
    const g = spec.posGroup(p.pos), depthAtPos = ctx.list.filter(q => spec.posGroup(q.pos) === g && q.ovr > p.ovr).length;
    let reason = null;
    if (ctx.mode === 'rebuild' && p.age >= a.peakEnd - 1 && p.ovr >= 62) reason = 'Reconstrução: vende veterano';
    else if (ctx.mode === 'contender' && depthAtPos >= 4 && p.ovr >= 60 && p.age <= a.growthEnd + 1) reason = 'Excesso de jovens na posição';
    else if (p.rel && p.rel.sat < 25 && p.rel.mo < 40) reason = 'Jogador insatisfeito';
    else if (p.c && p.c.sal > marketValue(spec, p) * 1.35 && p.c.yrs >= 2) reason = 'Contrato pesado';
    if (reason) out.push({ id: p.id, reason });
  }
  return out.slice(0, 6);
}
export function refreshBlocks(spec, c) {
  c.x.block.ai = {};
  for (const t of c.teams) if (t.abbr !== c.userTeam) c.x.block.ai[t.abbr] = aiBlock(spec, c, t.abbr).map(b => b.id);
}
export function getTradeBlock(spec, c) {
  const out = [];
  for (const [abbr, ids] of Object.entries(c.x.block.ai)) for (const id of ids) { const p = c.players[id]; if (p && p.t === abbr) out.push({ id, team: abbr, name: p.n, pos: p.pos, age: p.age, ovr: p.ovr, pot: p.pot, sal: p.c?.sal, yrs: p.c?.yrs, reason: aiBlock(spec, c, abbr).find(b => b.id === id)?.reason || 'Disponível' }); }
  return out.sort((a, b) => b.ovr - a.ovr);
}
export function setUserTradeBlock(spec, c, ids) {
  c.x.block.user = (ids || []).filter(id => c.players[id]?.t === c.userTeam);
  return { ok: true, ids: c.x.block.user };
}
// Offers the AI makes for the players the user shopped. Each is an offer the AI would accept (evaluate()).
export function getBlockOffers(spec, c) {
  const out = [], me = c.userTeam; if (!me || !c.x.block.user.length) return out;
  for (const t of c.teams) {
    if (t.abbr === me) continue;
    for (const id of c.x.block.user) {
      const p = c.players[id]; if (!p || p.t !== me) continue;
      const ctx = teamContext(spec, c, t.abbr), want = assetValue(spec, c, p, ctx);
      if (want <= 6) continue;
      const cands = [...teamPicks(spec, c, t.abbr, { years: 2 }).map(k => ({ type: 'k', key: k.key, v: pickValue(spec, c, k, ctx) })), ...ctx.list.filter(q => q.st !== 'MIN' && !q.mine && q.age <= spec.ageCurve.growthEnd + 1).map(q => ({ type: 'p', id: q.id, v: assetValue(spec, c, q, ctx) }))];
      const pick = cands.filter(a => a.v > 0 && a.v <= want * 0.95).sort((a, b) => b.v - a.v)[0];
      if (!pick) continue;
      const offer = { from: me, to: t.abbr, give: { players: [id], picks: [] }, get: { players: pick.type === 'p' ? [pick.id] : [], picks: pick.type === 'k' ? [pick.key] : [] } };
      if (evaluate(spec, c, offer).accept) out.push({ ...offer, team: t.abbr, value: pick.v });
    }
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 8);
}

// ---------- AI ↔ AI ----------
export function aiTradeRound(spec, c, rng, { deadline = false, attempts = 6 } = {}) {
  if (!tradeWindowOpen(spec, c)) return [];
  const ai = c.teams.filter(t => t.abbr !== c.userTeam), made = [];
  const sellers = ai.filter(t => t.mode === 'rebuild' || t.mode === 'middle'), buyers = ai.filter(t => t.mode === 'contender' || t.mode === 'middle');
  for (let i = 0; i < attempts && made.length < (deadline ? 3 : 1); i++) {
    const A = rng.pick(sellers), B = rng.pick(buyers); if (!A || !B || A === B) continue;
    const ctxA = teamContext(spec, c, A.abbr), ctxB = teamContext(spec, c, B.abbr);
    const vets = ctxA.list.filter(p => p.st === 'ACT' && !p.mine && !p.inj && p.ovr >= 66 && p.age >= spec.ageCurve.peakEnd - 2).sort((x, y) => y.ovr - x.ovr);
    const v = vets[rng.int(0, Math.min(vets.length - 1, 5))]; if (!v) continue;
    const vB = assetValue(spec, c, v, ctxB), vA = assetValue(spec, c, v, ctxA);
    const cands = [...teamPicks(spec, c, B.abbr, { years: 2 }).filter(k => k.r <= 4).map(k => ({ type: 'k', key: k.key, vA: pickValue(spec, c, k, ctxA), vB: pickValue(spec, c, k, ctxB) })),
      ...ctxB.list.filter(q => q.st !== 'PROSPECT' && !q.mine && q.age <= spec.ageCurve.growthEnd + 1 && q.id !== v.id).map(q => ({ type: 'p', id: q.id, vA: assetValue(spec, c, q, ctxA), vB: assetValue(spec, c, q, ctxB), q }))];
    // both clubs must gain by their own valuation; B pays with the least valuable-to-B asset that A likes enough
    const ok = cands.filter(a => a.vA >= vA * 1.03 && a.vB <= vB * 0.97 && a.vA > 3).sort((x, y) => x.vB - y.vB)[0];
    if (!ok) continue;
    const offer = { from: A.abbr, to: B.abbr, give: { players: [v.id], picks: [] }, get: { players: ok.type === 'p' ? [ok.id] : [], picks: ok.type === 'k' ? [ok.key] : [] } };
    const legal = spec.v3.validateTrade?.(spec, c, { aiTeam: B.abbr, userTeam: A.abbr, give: [v], get: ok.type === 'p' ? [c.players[ok.id]] : [] });
    if (legal) continue;
    const text = execute(spec, c, offer, { quiet: true });
    const star = v.ovr >= spec.starOvr - 6;
    c.history.transactions[c.history.transactions.length - 1].ai = true;
    if (star || deadline) news(c, text + '.', 'info');
    made.push({ ...offer, text, star, deadline });
  }
  return made;
}
