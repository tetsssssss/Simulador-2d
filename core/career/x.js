// Career 3.0 state (c.x) and its lifecycle. Everything the new systems need lives under c.x so v2 saves stay valid:
// ensureV3(spec, c) is idempotent and builds missing pieces deterministically from c.seed; the sport adapters are spec.v3.
import { createRng, hashSeed } from '../rng/rng.js';
import { fictionalName } from './people.js';
import { pickCurve } from './curves.js';
import { clamp, round1, hash01, DIFFICULTY, difficultyOf } from './kit.js';
import { initStaff, refreshStaffMarket, bustStaffFx } from './staff.js';

export const XV = 3;
export const FACILITIES = ['training', 'medical', 'scouting', 'youth', 'stadium'];
const teamsOf = c => c.teams.map(t => t.abbr);
const livePlayers = c => Object.values(c.players);

export function ensureV3(spec, c) {
  if (c.x?.ready) return c.x;
  if (!spec.v3) throw new Error(`spec ${spec.sport} sem regras da carreira 3.0 (spec.v3)`);
  const x = c.x ||= { v: XV };
  x.v = XV;
  if (c._spec == null) Object.defineProperty(c, '_spec', { value: spec, enumerable: false, configurable: true, writable: true });
  const migrated = !!x.migratedFrom;
  x.cal ||= { day: 0, offDay: 0 };
  x.cal.day ??= 0; x.cal.offDay ??= 0;
  if (c.phase === 'REGULAR' && c.slate > 0 && !x.cal.day) x.cal.day = Math.floor(c.slate * spec.calendar.slateDays);
  const rng = createRng(hashSeed(`${c.seed}-x-init`));
  // ---- team meta (market, prestige, facilities, staff quality, AI coach / GM) ----
  if (!x.meta) {
    x.meta = {};
    const ranked = [...c.teams].sort((a, b) => (b.rank ? -b.rank : 0) - (a.rank ? -a.rank : 0));
    for (const t of c.teams) {
      const h = k => hash01(`${c.seed}|${t.abbr}|${k}`);
      x.meta[t.abbr] = {
        mkt: round1(0.8 + h('mkt') * 0.45), prestige: clamp(Math.round(30 + (t.rank ? (1 - t.rank / c.teams.length) * 45 : 20) + h('pre') * 25), 5, 99),
        fac: { training: 1 + Math.floor(h('f1') * 4), medical: 1 + Math.floor(h('f2') * 4), scouting: 1 + Math.floor(h('f3') * 4), youth: 1 + Math.floor(h('f4') * 4), stadium: 1 + Math.floor(h('f5') * 4) },
        staffQ: Math.round(38 + h('sq') * 34), fans: Math.round(40 + h('fans') * 40),
        coach: { name: fictionalName(createRng(hashSeed(`${c.seed}|${t.abbr}|hc`))), rating: Math.round(40 + h('hcr') * 40), rep: Math.round(30 + h('hcrep') * 45), trust: 60, since: c.season - Math.floor(h('hcs') * 5), yrs: 1 + Math.floor(h('hcy') * 4) },
        gm: { name: fictionalName(createRng(hashSeed(`${c.seed}|${t.abbr}|gm`))), rating: Math.round(40 + h('gmr') * 40), rep: Math.round(30 + h('gmrep') * 45) },
      };
    }
    void ranked;
  }
  // ---- finance & facilities of the user ----
  const ref = spec.cap?.limit || 200, userMeta = x.meta[c.userTeam || myTeamAbbr(c)];
  if (!x.fin) {
    const pay = c.userTeam ? teamPayroll(c, c.userTeam) : 0, mkt = userMeta?.mkt ?? 1, diff = difficultyOf(c);
    x.fin = {
      cash: round1(ref * 0.22 * diff.cash * mkt), rev: 0, exp: 0, last: null,
      budget: { payroll: round1(clamp(pay * (1.05 + 0.08 * mkt), 0, spec.cap?.kind === 'hard' ? spec.cap.limit : ref * 0.9)), staff: round1(ref * 0.06), facilities: round1(ref * 0.05) },
      tax: 0,
    };
  }
  x.fac ||= { upgrades: [] }; // levels live in meta[abbr].fac; upgrades = in-progress constructions of the user
  x.training ||= { plan: { focus: 'balanced', intensity: 1, groups: {}, matchPrep: true }, load: 25, fam: 50, gains: [], week: 0 };
  x.scout ||= { know: {}, assign: {}, auto: true };
  x.gm ||= { tagUsed: 0, intlPool: round1(ref * 0.022), intlSpent: 0, intlSeason: 0 };
  x.picks ||= { trades: [] };
  x.block ||= { ai: {}, user: [] };
  x.events ||= { pending: [], log: [], seq: 0, cool: {} };
  x.feed ||= []; x.newsCur ||= { tx: c.history.transactions.length, awards: c.history.awards.length, slate: c.slate, seasonRec: 0 };
  x.prel ||= { coachTrust: 55, teammates: 55, management: 55, fans: 50, log: [] };
  x.market ||= { jobs: [], offers: [], seasonRef: c.season };
  x.coach ||= null;
  x.objectives ||= [];
  x.rep ??= DIFFICULTY[clamp(Math.round(c.settings.difficulty ?? 1), 0, 3)].repStart;
  x.owner ||= { mandate: null };
  x.seasonStats ||= {};
  // ---- sub-systems ----
  if (!x.staff) initStaff(spec, c); else refreshStaffMarket(spec, c);
  assignCurves(c);
  if (!x.tac && c.role === 'COACH') x.tac = spec.v3.tacticsDefault(spec, c, c.userTeam);
  if (!x.scouting0) { x.scouting0 = true; }
  // ---- league legality (AI teams always; the user's team only for fresh careers: v2 saves are never rewritten) ----
  normalizeLeague(spec, c, { includeUser: !migrated });
  if (spec.sport === 'mlb') x.intl = x.intl?.year === c.season ? x.intl : buildIntl(spec, c);
  x.ready = true;
  bustStaffFx(c);
  return x;
}
export const myTeamAbbr = c => c.userTeam || c.players[c.me?.id]?.t || null;
export function teamPayroll(c, abbr) { let s = 0; for (const p of livePlayers(c)) if (p.t === abbr && p.c && p.st !== 'RET' && p.st !== 'PROSPECT') s += p.c.sal || 0; return round1(s); }
export function assignCurves(c) {
  for (const p of livePlayers(c)) if (!p.cv) p.cv = p.mine ? 'NORMAL' : pickCurve(hash01(`${c.seed}|${p.id}|cv`));
}
export function cutToFA(c, p) {
  const from = p.t; p.t = 'FA'; p.st = 'FA'; p.role = null; p.c = { sal: 0, yrs: 0, kind: 'FA' }; p.on40 = false; p.lvl = null; p.rel = null;
  if (from !== 'FA') c.history.transactions.push({ s: c.season, kind: 'RELEASE', text: `${from} libera ${p.n}`, teams: [from], players: [p.id], silent: true });
}
export function normalizeLeague(spec, c, { includeUser = true } = {}) {
  for (const t of c.teams) {
    if (!includeUser && t.abbr === c.userTeam) continue;
    spec.v3.normalizeTeam(spec, c, t.abbr, { cutToFA: p => cutToFA(c, p) });
  }
}
// Enforces cap / roster rules for every AI team (and the user's when asked: start of the regular season).
export function enforceLegality(spec, c, { includeUser = true } = {}) {
  const fixed = [];
  for (const t of c.teams) {
    const user = t.abbr === myTeamAbbr(c);
    if (user && !includeUser) continue;
    const before = spec.v3.legality(spec, c, t.abbr);
    if (before.ok) continue;
    spec.v3.enforceTeam(spec, c, t.abbr, { cutToFA: p => cutToFA(c, p) });
    if (user) fixed.push({ team: t.abbr, issues: before.issues });
  }
  return fixed;
}
export const legalityOf = (spec, c, abbr) => spec.v3.legality(spec, c, abbr);
function buildIntl(spec, c) {
  for (const p of livePlayers(c)) if (p.t === 'INTL') delete c.players[p.id];
  const cls = spec.v3.intlClass(spec, c, c.season);
  for (const p of cls) c.players[p.id] = p;
  c.x.gm.intlSpent = 0; c.x.gm.intlSeason = c.season;
  return { year: c.season, open: false, ids: cls.map(p => p.id) };
}
export function rebuildIntl(spec, c) { if (spec.sport === 'mlb') c.x.intl = buildIntl(spec, c); }
